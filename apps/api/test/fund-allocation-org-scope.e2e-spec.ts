import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * Fund → project allocation must stay inside the fund's own managing
 * organization: the project must either be owned by that organization, or
 * actively executed by it (executing_agency participation). Funds with no
 * managing organization keep the old, unrestricted behavior.
 */
describe('Fund allocation — project must belong to the fund\'s organization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let orgAId: number;
  let orgBId: number;
  let scopedFundId: number;
  let unscopedFundId: number;
  let ownedProjectId: number;
  let outsideProjectId: number;
  let executedProjectId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { type: 'ngo', name: 'Fund Org Scope A', status: 'active' } }),
      prisma.organization.create({ data: { type: 'ngo', name: 'Fund Org Scope B', status: 'active' } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Project directly owned by org A.
    ({ projectId: ownedProjectId } = await createProjectViaApi(app, admin, 'fund-scope-owned'));
    await prisma.project.update({ where: { id: ownedProjectId }, data: { ownerOrganizationId: orgAId } });

    // Project owned by org B — outside org A, should be rejected for a fund scoped to org A.
    ({ projectId: outsideProjectId } = await createProjectViaApi(app, admin, 'fund-scope-outside'));
    await prisma.project.update({ where: { id: outsideProjectId }, data: { ownerOrganizationId: orgBId } });

    // Project owned by org B but actively executed by org A — should be accepted.
    ({ projectId: executedProjectId } = await createProjectViaApi(app, admin, 'fund-scope-executed'));
    await prisma.project.update({ where: { id: executedProjectId }, data: { ownerOrganizationId: orgBId } });
    await http()
      .post(`/api/v1/projects/${executedProjectId}/participations`)
      .set('Authorization', admin)
      .send({ organizationId: orgAId, role: 'executing_agency' })
      .expect(201);

    const scopedFund = await http()
      .post('/api/v1/funds')
      .set('Authorization', admin)
      .send({ name: 'Org-Scoped Fund', managingOrganizationId: orgAId })
      .expect(201);
    scopedFundId = scopedFund.body.data.id;

    const unscopedFund = await http()
      .post('/api/v1/funds')
      .set('Authorization', admin)
      .send({ name: 'Unscoped Fund' })
      .expect(201);
    unscopedFundId = unscopedFund.body.data.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('accepts an allocation to a project owned by the fund\'s managing organization', async () => {
    const res = await http()
      .post(`/api/v1/funds/${scopedFundId}/allocations`)
      .set('Authorization', admin)
      .send({ projectId: ownedProjectId, amount: 100 })
      .expect(201);
    expect(res.body.data.projectId).toBe(ownedProjectId);
  });

  it('accepts an allocation to a project the fund\'s organization executes via an active executing_agency participation', async () => {
    const res = await http()
      .post(`/api/v1/funds/${scopedFundId}/allocations`)
      .set('Authorization', admin)
      .send({ projectId: executedProjectId, amount: 50 })
      .expect(201);
    expect(res.body.data.projectId).toBe(executedProjectId);
  });

  it('rejects a cross-organization allocation with a BadRequestException', async () => {
    const res = await http()
      .post(`/api/v1/funds/${scopedFundId}/allocations`)
      .set('Authorization', admin)
      .send({ projectId: outsideProjectId, amount: 100 })
      .expect(400);
    expect(res.body.message).toContain("does not belong to this fund's managing organization");
  });

  it('a fund without a managing organization keeps the old, unrestricted behavior', async () => {
    const res = await http()
      .post(`/api/v1/funds/${unscopedFundId}/allocations`)
      .set('Authorization', admin)
      .send({ projectId: outsideProjectId, amount: 100 })
      .expect(201);
    expect(res.body.data.projectId).toBe(outsideProjectId);
  });

  it('GET /projects?organizationId= scopes the picker to that organization only', async () => {
    const res = await http()
      .get('/api/v1/projects')
      .query({ organizationId: orgAId, limit: 50 })
      .expect(200);
    const ids = res.body.data.data.map((p: { id: number }) => p.id);
    expect(ids).toContain(ownedProjectId);
    expect(ids).not.toContain(outsideProjectId);
    expect(ids).not.toContain(executedProjectId); // executing org ≠ owning org for this filter
  });
});
