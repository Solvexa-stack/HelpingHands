import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * Invitation activation flow (org onboarding): invite → dev activation link →
 * POST /auth/activate-invite sets identity + password and issues org-scoped
 * JWTs → the invitee lands in their organization workspace with tenant-scoped
 * data and no platform access. The dev link never appears in production mode.
 */
describe('Invite activation flow (org onboarding)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformAdmin: string;
  let orgId: number;
  let activationToken: string;
  let inviteeAuth: string;

  const http = () => request(app.getHttpServer());
  const jwtPayload = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    platformAdmin = await authHeaderFor(prisma, 'administrator');

    const org = await http()
      .post('/api/v1/organizations')
      .set('Authorization', platformAdmin)
      .send({ type: 'ngo', name: 'Onboarding NGO' })
      .expect(201);
    orgId = org.body.data.id;
    await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', platformAdmin)
      .send({ status: 'active' })
      .expect(200);
  });

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  it('invite responds with the activation link outside production (dev fallback)', async () => {
    const invite = await http()
      .post(`/api/v1/organizations/${orgId}/invite-admin`)
      .set('Authorization', platformAdmin)
      .send({ email: 'onboard.admin@example.com', firstName: 'Pending', lastName: 'Invitee' })
      .expect(201);

    expect(invite.body.data.message).toBe('Invitation created');
    expect(invite.body.data.userId).toBeDefined();
    expect(invite.body.data.activationUrl).toMatch(/^\/activate\?token=.+/);
    expect(invite.body.data.activationToken).toBeDefined();
    activationToken = invite.body.data.activationToken;

    // the token is the reset-flow invitation token persisted for this email
    const record = await prisma.passwordResetToken.findUnique({ where: { token: activationToken } });
    expect(record!.email).toBe('onboard.admin@example.com');
  });

  it('the activation link is NOT exposed in production mode', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const invite = await http()
        .post(`/api/v1/organizations/${orgId}/invite-admin`)
        .set('Authorization', platformAdmin)
        .send({ email: 'prod.invitee@example.com', firstName: 'Prod', lastName: 'Invitee' })
        .expect(201);
      expect(invite.body.data.activationUrl).toBeUndefined();
      expect(invite.body.data.activationToken).toBeUndefined();
      expect(invite.body.data.userId).toBeDefined(); // contract otherwise unchanged
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('rejects bad tokens and weak passwords', async () => {
    await http()
      .post('/api/v1/auth/activate-invite')
      .send({ token: 'nonsense', firstName: 'A', lastName: 'B', password: 'Str0ng@Pass' })
      .expect(400);
    await http()
      .post('/api/v1/auth/activate-invite')
      .send({ token: activationToken, firstName: 'A', lastName: 'B', password: 'weak' })
      .expect(400);
  });

  it('activates the account: identity + password set, org-scoped JWT issued', async () => {
    const res = await http()
      .post('/api/v1/auth/activate-invite')
      .send({ token: activationToken, firstName: 'Amina', lastName: 'Kaddour', password: 'Onboard@123' })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('onboard.admin@example.com');
    inviteeAuth = `Bearer ${res.body.data.accessToken}`;

    // JWT carries the invited organization as the active workspace
    const payload = jwtPayload(res.body.data.accessToken);
    expect(payload.activeOrgId).toBe(orgId);
    expect(payload.referenceType).toBe('admin');

    // identity was applied to the Admin row
    const user = await prisma.user.findUnique({ where: { email: 'onboard.admin@example.com' } });
    const admin = await prisma.admin.findUnique({ where: { id: user!.referenceId } });
    expect(admin!.firstName).toBe('Amina');
    expect(admin!.lastName).toBe('Kaddour');

    // membership + org_admin grant from the invite are intact (no new roles)
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user!.id, organizationId: orgId, status: 'active' },
    });
    expect(membership).not.toBeNull();
    const grants = await prisma.roleAssignment.findMany({ where: { userId: user!.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ role: 'org_admin', scopeType: 'organization', scopeId: orgId });
  });

  it('the invitation token is single-use', async () => {
    await http()
      .post('/api/v1/auth/activate-invite')
      .send({ token: activationToken, firstName: 'X', lastName: 'Y', password: 'Another@123' })
      .expect(400);
  });

  it('login works with the chosen password and yields the same active workspace', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'onboard.admin@example.com', password: 'Onboard@123' })
      .expect(200);
    expect(jwtPayload(login.body.data.accessToken).activeOrgId).toBe(orgId);
    expect(login.body.data.user.referenceType).toBe('admin');
  });

  it('the invitee lands in a working, tenant-scoped workspace (the /org/dashboard contract)', async () => {
    // workspace resolution: org membership, no Board workspace → organization workspace
    const contexts = await http().get('/api/v1/auth/contexts').set('Authorization', inviteeAuth).expect(200);
    expect(contexts.body.data.hasBoardWorkspace).toBe(false);
    expect(contexts.body.data.organizations.map((o: any) => o.id)).toEqual([orgId]);

    // dashboard numbers are the org's own (fresh org: zeros, no platform tiles)
    const stats = await http().get('/api/v1/dashboard/stats').set('Authorization', inviteeAuth).expect(200);
    expect(stats.body.data.totalProjects).toBe(0);
    expect(stats.body.data.totalParticipants).toBeUndefined();

    // project list is tenant-scoped: seeded platform projects are invisible
    const projects = await http().get('/api/v1/projects?limit=100').set('Authorization', inviteeAuth).expect(200);
    expect(projects.body.data.data).toEqual([]);

    // own org profile + team readable (Settings/Team pages)
    await http().get(`/api/v1/organizations/${orgId}`).set('Authorization', inviteeAuth).expect(200);
    await http().get(`/api/v1/organizations/${orgId}/members`).set('Authorization', inviteeAuth).expect(200);
  });

  describe('direct-credentials mode (owner sets email + password)', () => {
    it('creates a member who can log in immediately — no activation link involved', async () => {
      const res = await http()
        .post(`/api/v1/organizations/${orgId}/invite-admin`)
        .set('Authorization', platformAdmin)
        .send({
          email: 'direct.member@example.com',
          firstName: 'Direct',
          lastName: 'Member',
          password: 'Direct@1234',
          role: 'staff',
        })
        .expect(201);
      expect(res.body.data.message).toContain('log in immediately');
      expect(res.body.data.role).toBe('staff');
      expect(res.body.data.activationUrl).toBeUndefined();
      expect(res.body.data.activationToken).toBeUndefined();

      // no invitation token exists — there is nothing to activate
      const token = await prisma.passwordResetToken.findFirst({ where: { email: 'direct.member@example.com' } });
      expect(token).toBeNull();

      // the credentials the owner set work right away, scoped to the workspace
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'direct.member@example.com', password: 'Direct@1234' })
        .expect(200);
      expect(jwtPayload(login.body.data.accessToken).activeOrgId).toBe(orgId);

      // the chosen catalog role was granted (not the org_admin default)
      const grants = await prisma.roleAssignment.findMany({ where: { userId: res.body.data.userId } });
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ role: 'staff', scopeType: 'organization', scopeId: orgId });
    });

    it('rejects weak passwords and roles outside the catalog', async () => {
      await http()
        .post(`/api/v1/organizations/${orgId}/invite-admin`)
        .set('Authorization', platformAdmin)
        .send({ email: 'weak.member@example.com', firstName: 'W', lastName: 'M', password: 'weak' })
        .expect(400);
      await http()
        .post(`/api/v1/organizations/${orgId}/invite-admin`)
        .set('Authorization', platformAdmin)
        .send({ email: 'rogue.member@example.com', firstName: 'R', lastName: 'M', role: 'board_chair' })
        .expect(400); // platform roles are not grantable through the workspace form
    });
  });

  it('the invitee cannot reach platform surfaces', async () => {
    await http().get('/api/v1/governance/queue').set('Authorization', inviteeAuth).expect(403);
    await http().get('/api/v1/governance/decisions').set('Authorization', inviteeAuth).expect(403);
    await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', inviteeAuth)
      .send({ status: 'suspended' })
      .expect(403); // lifecycle stays a Board verb
    // foreign org reads as denied
    await http().get('/api/v1/organizations/1').set('Authorization', inviteeAuth).expect(403);
    // platform-only reads: org list and audit trail are not tenant surfaces
    await http().get('/api/v1/organizations').set('Authorization', inviteeAuth).expect(403);
    await http().get('/api/v1/audit').set('Authorization', inviteeAuth).expect(403);
  });
});
