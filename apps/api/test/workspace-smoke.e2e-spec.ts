import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * Workspace smoke test — the full usability loop the admin app runs on:
 * onboard Org A → activate → create a project → the org dashboard shows it
 * and carries the org identity, platform surfaces stay hidden; Org B cannot
 * see it; the Board admin finds Org A, enters its workspace through the
 * audited switch-context bypass, and sees the project.
 */
describe('Workspace smoke (org onboarding → project → dashboards)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let boardAdmin: string;
  let orgA: number;
  let orgAAdmin: string;
  let projectId: number;

  const http = () => request(app.getHttpServer());
  const jwtPayload = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());

  async function onboard(name: string, email: string): Promise<{ orgId: number; auth: string }> {
    const org = await http().post('/api/v1/organizations').set('Authorization', boardAdmin).send({ type: 'ngo', name }).expect(201);
    const orgId = org.body.data.id;
    await http().put(`/api/v1/organizations/${orgId}`).set('Authorization', boardAdmin).send({ status: 'active' }).expect(200);
    const invite = await http()
      .post(`/api/v1/organizations/${orgId}/invite-admin`)
      .set('Authorization', boardAdmin)
      .send({ email, firstName: 'Pending', lastName: 'Admin' })
      .expect(201);
    await http()
      .post('/api/v1/auth/activate-invite')
      .send({ token: invite.body.data.activationToken, firstName: 'Org', lastName: 'Admin', password: 'Smoke@1234' })
      .expect(200);
    const login = await http().post('/api/v1/auth/login').send({ email, password: 'Smoke@1234' }).expect(200);
    return { orgId, auth: `Bearer ${login.body.data.accessToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    boardAdmin = await authHeaderFor(prisma, 'administrator');

    const a = await onboard('Workspace Org A', 'wsa.admin@example.com');
    orgA = a.orgId;
    orgAAdmin = a.auth;
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  it('the activated org admin creates Project A inside their workspace', async () => {
    const block = await http()
      .post('/api/v1/blocks')
      .set('Authorization', orgAAdmin)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: 'Project A', slug: 'workspace-project-a', brief: 'b', description: 'd' }],
      })
      .expect(201);
    const project = await http()
      .post('/api/v1/projects')
      .set('Authorization', orgAAdmin)
      .send({ blockId: block.body.data.id, value: 1000, category: 'agricultural' })
      .expect(201);
    projectId = project.body.data.id;
    expect(project.body.data.ownerOrganizationId).toBe(orgA); // linked to the active org
  });

  it('org dashboard shows the project and the organization identity; platform menus stay hidden', async () => {
    // /org/dashboard data: count = 1, recent = Project A
    const stats = await http().get('/api/v1/dashboard/stats').set('Authorization', orgAAdmin).expect(200);
    expect(stats.body.data.totalProjects).toBe(1);

    const recent = await http().get('/api/v1/dashboard/recent-projects').set('Authorization', orgAAdmin).expect(200);
    expect(recent.body.data).toHaveLength(1);
    expect(recent.body.data[0].id).toBe(projectId);
    expect(recent.body.data[0].block.translations[0].name).toBe('Project A');

    // organization name visible: contexts carry the workspace identity
    const contexts = await http().get('/api/v1/auth/contexts').set('Authorization', orgAAdmin).expect(200);
    expect(contexts.body.data.organizations).toEqual([
      expect.objectContaining({ id: orgA, name: 'Workspace Org A' }),
    ]);
    expect(contexts.body.data.hasBoardWorkspace).toBe(false); // → org workspace layout, no platform nav

    // platform surfaces are unreachable (the API contract behind hidden menus)
    await http().get('/api/v1/governance/queue').set('Authorization', orgAAdmin).expect(403);
    await http().get('/api/v1/organizations').set('Authorization', orgAAdmin).expect(403);
    await http().get('/api/v1/audit').set('Authorization', orgAAdmin).expect(403);
  });

  it('Organization B cannot see Project A', async () => {
    const b = await onboard('Workspace Org B', 'wsb.admin@example.com');
    const projects = await http().get('/api/v1/projects?limit=100').set('Authorization', b.auth).expect(200);
    expect(projects.body.data.data).toEqual([]);
    await http().get(`/api/v1/projects/${projectId}`).set('Authorization', b.auth).expect(404);
  });

  it('the Board admin sees Org A, enters its workspace (audited bypass), and sees the project', async () => {
    // Org A appears in the organizations directory
    const orgs = await http().get('/api/v1/organizations?limit=100').set('Authorization', boardAdmin).expect(200);
    expect(orgs.body.data.data.map((o: any) => o.name)).toContain('Workspace Org A');

    // Board admin is NOT a member of Org A — the switch still succeeds (bypass)
    const member = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgA, user: { email: 'admin@helpinghands.org' } },
    });
    expect(member).toBeNull();

    const switched = await http()
      .post('/api/v1/auth/switch-context')
      .set('Authorization', boardAdmin)
      .send({ organizationId: orgA })
      .expect(200);
    const payload = jwtPayload(switched.body.data.accessToken);
    expect(payload.activeOrgId).toBe(orgA);

    // inside the workspace the Board sees the project (read-everywhere)
    const projects = await http()
      .get('/api/v1/projects?limit=100')
      .set('Authorization', `Bearer ${switched.body.data.accessToken}`)
      .expect(200);
    expect(projects.body.data.data.map((p: any) => p.id)).toContain(projectId);

    // the bypass entry is audited
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'workspace.switched', subjectType: 'organization', subjectId: String(orgA) },
      orderBy: { id: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit!.after as any).boardBypass).toBe(true);

    // ordinary non-members are still refused
    const orgBAdmin = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'wsb.admin@example.com', password: 'Smoke@1234' })
      .expect(200);
    await http()
      .post('/api/v1/auth/switch-context')
      .set('Authorization', `Bearer ${orgBAdmin.body.data.accessToken}`)
      .send({ organizationId: orgA })
      .expect(401);
  });
});
