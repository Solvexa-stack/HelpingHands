import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W2-E3-S1/S2 — permanent two-org leak test. Two orgs with full data trees;
 * with TENANCY_ENFORCED on, org users see zero cross-org data on every
 * list/detail endpoint; the Board account sees everything WITH audit rows.
 */
describe('Two-org tenancy leak test (W2-E3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;      // administrator = Board (platform grant)
  let employee: string;   // org1 staff (default org)
  let org2User: string;   // org2 staff
  let projectOrg1: number;
  let projectOrg2: number;
  let org2Id: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    [admin, employee] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
    ]);

    // Org 2 with its own staff user (admin referenceType so legacy RolesGuard admits them)
    const org2 = await prisma.organization.create({
      data: { type: 'ngo', name: 'Second NGO', status: 'active', capabilities: {} },
    });
    org2Id = org2.id;
    const org2Admin = await prisma.admin.create({ data: { firstName: 'Org2', lastName: 'Staff', role: 'employee' } });
    const org2UserRow = await prisma.user.create({
      data: { referenceId: org2Admin.id, referenceType: 'admin', email: 'org2.staff@example.com' },
    });
    await prisma.organizationMembership.create({ data: { organizationId: org2.id, userId: org2UserRow.id } });
    await prisma.roleAssignment.create({
      data: { userId: org2UserRow.id, role: 'staff', scopeType: 'organization', scopeId: org2.id },
    });
    org2User = `Bearer ${await new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }).signAsync({
      sub: org2UserRow.id, email: org2UserRow.email, role: 'employee', referenceType: 'admin',
      referenceId: org2Admin.id, activeOrgId: org2.id, tokenVersion: 2,
    })}`;

    // Full tree in org 1 (default org via API)
    ({ projectId: projectOrg1 } = await createProjectViaApi(app, employee, 'leak-org1', { value: 1000 }));
    // Org 2 project created directly with its owner
    const block2 = await prisma.block.create({ data: { category: 'project' } });
    const p2 = await prisma.project.create({
      data: { blockId: block2.id, value: 2000, category: 'agricultural', ownerOrganizationId: org2.id },
    });
    projectOrg2 = p2.id;
    await prisma.projectMilestone.create({ data: { projectId: block2.id, projectRefId: p2.id, blockId: block2.id } });

    process.env.TENANCY_ENFORCED = 'true';
  });

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    await app.close();
  });

  it('org users see only their own projects in lists', async () => {
    const org1List = await http().get('/api/v1/projects?limit=100').set('Authorization', employee).expect(200);
    const org1Ids = org1List.body.data.data.map((p: any) => p.id);
    expect(org1Ids).toContain(projectOrg1);
    expect(org1Ids).not.toContain(projectOrg2);

    const org2List = await http().get('/api/v1/projects?limit=100').set('Authorization', org2User).expect(200);
    const org2Ids = org2List.body.data.data.map((p: any) => p.id);
    expect(org2Ids).toContain(projectOrg2);
    expect(org2Ids).not.toContain(projectOrg1);
  });

  it('cross-org detail and subtree endpoints read as 404 (no information leak)', async () => {
    await http().get(`/api/v1/projects/${projectOrg2}`).set('Authorization', employee).expect(404);
    await http().get(`/api/v1/projects/${projectOrg2}/milestones`).set('Authorization', employee).expect(404);
    await http().get(`/api/v1/projects/${projectOrg2}/execution/phases`).set('Authorization', employee).expect(404);
    await http().get(`/api/v1/projects/${projectOrg2}/financial/summary`).set('Authorization', employee).expect(404);

    await http().get(`/api/v1/projects/${projectOrg1}/milestones`).set('Authorization', org2User).expect(404);
    // own data still fully reachable
    await http().get(`/api/v1/projects/${projectOrg1}/milestones`).set('Authorization', employee).expect(200);
    await http().get(`/api/v1/projects/${projectOrg2}/milestones`).set('Authorization', org2User).expect(200);
  });

  it('anonymous/public reads are unchanged (both projects public)', async () => {
    const res = await http().get('/api/v1/projects?limit=100').expect(200);
    const ids = res.body.data.data.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining([projectOrg1, projectOrg2]));
  });

  it('the Board account sees across orgs WITH audit entries (S2 AC)', async () => {
    const list = await http().get('/api/v1/projects?limit=100').set('Authorization', admin).expect(200);
    const ids = list.body.data.data.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining([projectOrg1, projectOrg2]));
    await http().get(`/api/v1/projects/${projectOrg2}`).set('Authorization', admin).expect(200);

    for (let i = 0; i < 30; i++) {
      const rows = await prisma.auditLog.findMany({ where: { action: 'tenancy.bypassed' } });
      if (rows.length >= 2) {
        expect(rows.some((r) => r.subjectId === 'project.list')).toBe(true);
        expect(rows.some((r) => r.subjectId === `project.read:${projectOrg2}`)).toBe(true);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('tenancy.bypassed audit rows never appeared');
  });

  it('flag OFF restores Wave 1 behavior', async () => {
    process.env.TENANCY_ENFORCED = 'false';
    try {
      const list = await http().get('/api/v1/projects?limit=100').set('Authorization', employee).expect(200);
      expect(list.body.data.data.map((p: any) => p.id)).toContain(projectOrg2);
      await http().get(`/api/v1/projects/${projectOrg2}/milestones`).set('Authorization', employee).expect(200);
    } finally {
      process.env.TENANCY_ENFORCED = 'true';
    }
  });
});

/**
 * W2-E5-S1 — workspace contexts: listing and switching produce correctly
 * scoped tokens (the shell's backend contract).
 */
describe('Workspace context switching (W2-E5-S1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists memberships + Board workspace; switching mints an org-scoped token; foreign org refused', async () => {
    const admin = await authHeaderFor(prisma, 'administrator');
    const contexts = await request(app.getHttpServer())
      .get('/api/v1/auth/contexts')
      .set('Authorization', admin)
      .expect(200);
    expect(contexts.body.data.hasBoardWorkspace).toBe(true);
    const orgs = contexts.body.data.organizations;
    expect(orgs.length).toBeGreaterThanOrEqual(2); // default org + Board org

    const target = orgs[1].id;
    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-context')
      .set('Authorization', admin)
      .send({ organizationId: target })
      .expect(200);
    const payload = JSON.parse(
      Buffer.from(switched.body.data.accessToken.split('.')[1], 'base64').toString(),
    );
    expect(payload.activeOrgId).toBe(target);

    // the new token works and a non-membership switch is refused
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${switched.body.data.accessToken}`)
      .expect(200);
    const employee = await authHeaderFor(prisma, 'employee');
    const org2 = await prisma.organization.create({
      data: { type: 'ngo', name: 'Foreign Org', status: 'active', capabilities: {} },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/switch-context')
      .set('Authorization', employee)
      .send({ organizationId: org2.id })
      .expect(401);
  });
});
