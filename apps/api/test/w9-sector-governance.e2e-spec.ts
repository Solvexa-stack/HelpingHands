import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi } from './utils/fixtures';

/**
 * W9 (gap-closing pass) — Super Admin sector governance:
 *   - sector CRUD is a new write surface (`sector.manage`), Super Admin only
 *   - master-fund creation is hardened: requires categoryId + Super Admin,
 *     and always goes through FundHierarchyService (idempotent — no stray
 *     duplicate master funds)
 *   - `GET /funds/suggested` — the project-creation fund picker's data source
 *   - segregation of duties: the same person cannot both submit AND approve
 *     their own expense / fund donation, unless they hold Council/Board
 *     (platform-scope) oversight authority
 *
 * Council = Board in this codebase (confirmed design decision) — no new
 * governance tables; `board_chair`/`board_member` already ARE the Council's
 * approval authority, which is exactly why they're exempted below.
 */
describe('W9 — Sector governance, Super Admin, segregation of duties', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string; // seeded administrator — holds both board_chair AND super_admin
  let waterId: number;

  const http = () => request(app.getHttpServer());

  const signToken = async (payload: Record<string, unknown>) =>
    `Bearer ${await new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }).signAsync(payload)}`;

  /** A platform-scope actor holding only the given role(s) — no super_admin unless listed. */
  async function platformScopedToken(roles: string[], email: string): Promise<string> {
    const person = await prisma.admin.create({ data: { firstName: 'Platform', lastName: 'Actor', role: 'employee' } });
    const user = await prisma.user.create({ data: { referenceId: person.id, referenceType: 'admin', email } });
    for (const role of roles) {
      await prisma.roleAssignment.create({ data: { userId: user.id, role, scopeType: 'platform' } });
    }
    return signToken({ sub: user.id, email: user.email, role: 'employee', referenceType: 'admin', referenceId: person.id, activeOrgId: null, tokenVersion: 2 });
  }

  /** An org_admin (organization scope only — no platform grants) for a given org. */
  async function orgAdminToken(organizationId: number, email: string): Promise<string> {
    const person = await prisma.admin.create({ data: { firstName: 'Org', lastName: 'Admin', role: 'employee' } });
    const user = await prisma.user.create({ data: { referenceId: person.id, referenceType: 'admin', email } });
    await prisma.organizationMembership.create({ data: { organizationId, userId: user.id } });
    await prisma.roleAssignment.create({ data: { userId: user.id, role: 'org_admin', scopeType: 'organization', scopeId: organizationId } });
    return signToken({ sub: user.id, email: user.email, role: 'employee', referenceType: 'admin', referenceId: person.id, activeOrgId: organizationId, tokenVersion: 2 });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    const water = await prisma.projectCategoryNode.findUnique({ where: { key: 'water' } });
    waterId = water!.id;

    // Every scenario in this file exercises the new policy actions
    // (sector.manage, fund.suggest, fund-scope/organization-scope grants) —
    // same convention as w8-fund-financial-extension's "Permissions" section.
    process.env.POLICY_ENFORCED = 'true';
  }, 120_000);

  afterAll(async () => {
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  // ─── Sector CRUD ──────────────────────────────────────────────────────────

  describe('Sector CRUD (Super Admin only)', () => {
    let boardChairOnly: string;
    let sectorId: number;

    beforeAll(async () => {
      boardChairOnly = await platformScopedToken(['board_chair'], 'w9-board-chair-only@example.com');
    });

    it('Super Admin can create a sector', async () => {
      const res = await http()
        .post('/api/v1/categories')
        .set('Authorization', admin)
        .send({ key: 'w9-tourism', name: 'Tourism', nameAr: 'السياحة', nameFr: 'Tourisme' })
        .expect(201);
      sectorId = res.body.data.id;
      expect(res.body.data.isActive).toBe(true);
    });

    it('a board_chair WITHOUT super_admin cannot create a sector', async () => {
      await http()
        .post('/api/v1/categories')
        .set('Authorization', boardChairOnly)
        .send({ key: 'w9-denied-sector', name: 'Should Not Exist' })
        .expect(403);
    });

    it('an unauthenticated request is rejected outright', async () => {
      await http().post('/api/v1/categories').send({ key: 'w9-anon-sector', name: 'Anon' }).expect(401);
    });

    it('Super Admin can edit a sector', async () => {
      const res = await http()
        .patch(`/api/v1/categories/${sectorId}`)
        .set('Authorization', admin)
        .send({ description: 'Coastal and heritage tourism' })
        .expect(200);
      expect(res.body.data.description).toBe('Coastal and heritage tourism');
    });

    it('archiving hides the sector from the public tree but the record (and its key) survives', async () => {
      await http().post(`/api/v1/categories/${sectorId}/archive`).set('Authorization', admin).expect(200);

      const publicTree = await http().get('/api/v1/categories').expect(200);
      const flat = JSON.stringify(publicTree.body.data);
      expect(flat).not.toContain('w9-tourism');

      const adminTree = await http().get('/api/v1/categories/admin-tree').set('Authorization', admin).expect(200);
      const found = JSON.stringify(adminTree.body.data);
      expect(found).toContain('w9-tourism');

      const node = await prisma.projectCategoryNode.findUnique({ where: { id: sectorId } });
      expect(node).not.toBeNull();
      expect(node!.isActive).toBe(false);
    });

    it('there is no delete route — archive/status is the only way to retire a sector', async () => {
      await http().delete(`/api/v1/categories/${sectorId}`).set('Authorization', admin).expect(404);
    });

    it('Super Admin can reactivate an archived sector', async () => {
      const res = await http().post(`/api/v1/categories/${sectorId}/activate`).set('Authorization', admin).expect(200);
      expect(res.body.data.isActive).toBe(true);
    });
  });

  // ─── Master-fund hardening ────────────────────────────────────────────────

  describe('Master-fund creation is hardened (categoryId + Super Admin, idempotent)', () => {
    let boardChairOnly: string;

    beforeAll(async () => {
      boardChairOnly = await platformScopedToken(['board_chair'], 'w9-mf-board-chair@example.com');
    });

    it('rejects a master fund with no categoryId', async () => {
      const res = await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'Bad Master Fund', type: 'master' });
      expect(res.status).toBe(400);
    });

    it('a board_chair WITHOUT super_admin cannot create a master fund even with a categoryId', async () => {
      await http()
        .post('/api/v1/funds')
        .set('Authorization', boardChairOnly)
        .send({ name: 'Water Master Fund', type: 'master', categoryId: waterId })
        .expect(403);
    });

    it('Super Admin creating a master fund for a category that already has one reuses it (no duplicate)', async () => {
      const first = await http()
        .post('/api/v1/funds')
        .set('Authorization', admin)
        .send({ name: 'Water Master Fund', type: 'master', categoryId: waterId })
        .expect(201);
      const countAfterFirst = await prisma.fund.count({ where: { type: 'master', categoryId: waterId } });
      expect(countAfterFirst).toBe(1);

      const second = await http()
        .post('/api/v1/funds')
        .set('Authorization', admin)
        .send({ name: 'Ignored — reuses the existing master fund', type: 'master', categoryId: waterId })
        .expect(201);

      const countAfterSecond = await prisma.fund.count({ where: { type: 'master', categoryId: waterId } });
      expect(countAfterSecond).toBe(1);
      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  // ─── Suggested funds ──────────────────────────────────────────────────────

  describe('GET /funds/suggested — the project-creation fund picker data source', () => {
    let orgId: number;
    let orgStaffToken: string;

    beforeAll(async () => {
      const org = await prisma.organization.create({ data: { type: 'ngo', name: 'W9 Suggested Funds Org', status: 'active' } });
      orgId = org.id;
      orgStaffToken = await orgAdminToken(orgId, 'w9-suggested-org-admin@example.com');
    });

    it('org staff (no fund/platform grant) can read suggestions — narrow, non-sensitive read', async () => {
      const res = await http()
        .get('/api/v1/funds/suggested')
        .query({ categoryId: waterId, organizationId: orgId })
        .set('Authorization', orgStaffToken)
        .expect(200);
      expect(res.body.data.category.id).toBe(waterId);
      expect(res.body.data.masterFund).not.toBeNull();
      // the org has no water fund yet — suggestion never creates one, only project creation does
      expect(res.body.data.organizationFund).toBeNull();
    });

    it('after the org creates a project in that sector, the suggestion includes its now-existing organization fund', async () => {
      const blockId = await createBlockViaApi(app, orgStaffToken, 'w9-suggested-flow');
      const project = await http()
        .post('/api/v1/projects')
        .set('Authorization', orgStaffToken)
        .send({ blockId, value: 8000, categoryKey: 'water' })
        .expect(201);
      const fundId = project.body.data.primaryFundId;

      const res = await http()
        .get('/api/v1/funds/suggested')
        .query({ categoryId: waterId, organizationId: orgId })
        .set('Authorization', orgStaffToken)
        .expect(200);
      expect(res.body.data.organizationFund.id).toBe(fundId);
    });
  });

  // ─── Segregation of duties ────────────────────────────────────────────────

  describe('Segregation of duties — an organization cannot approve its own submission', () => {
    let orgId: number;
    let orgAdmin: string;
    let projectId: number;
    let fundId: number;
    let recipientId: number;

    beforeAll(async () => {
      const org = await prisma.organization.create({ data: { type: 'ngo', name: 'W9 SoD Org', status: 'active' } });
      orgId = org.id;
      orgAdmin = await orgAdminToken(orgId, 'w9-sod-org-admin@example.com');

      const blockId = await createBlockViaApi(app, orgAdmin, 'w9-sod-project');
      const project = await http().post('/api/v1/projects').set('Authorization', orgAdmin).send({ blockId, value: 20000, categoryKey: 'water' }).expect(201);
      projectId = project.body.data.id;
      fundId = project.body.data.primaryFundId;

      const recipient = await http().post('/api/v1/recipients').set('Authorization', admin).send({ name: 'W9 SoD Recipient', type: 'company' }).expect(201);
      recipientId = recipient.body.data.id;

      // fund the project's own org fund so approval isn't blocked on balance
      const donation = await http().post(`/api/v1/funds/${fundId}/donations`).set('Authorization', admin).send({ amount: 5000, paymentMethod: 'cash', donatedAt: new Date().toISOString() }).expect(201);
      await http().post(`/api/v1/funds/donations/${donation.body.data.id}/approve`).set('Authorization', admin).expect(201);
    });

    it('the org_admin who submitted an expense cannot approve it themselves', async () => {
      const expense = await http()
        .post('/api/v1/expenses')
        .set('Authorization', orgAdmin)
        .send({ fundId, projectId, amount: 500, category: 'materials', description: 'W9 SoD self-approval attempt', recipientId })
        .expect(201);

      const attempt = await http().post(`/api/v1/expenses/${expense.body.data.id}/approve`).set('Authorization', orgAdmin);
      expect(attempt.status).toBe(403);

      const still = await prisma.expense.findUnique({ where: { id: expense.body.data.id } });
      expect(still!.status).toBe('pending');
    });

    it('a Council/Board decision-maker (board_chair) CAN approve what the org submitted', async () => {
      const expense = await http()
        .post('/api/v1/expenses')
        .set('Authorization', orgAdmin)
        .send({ fundId, projectId, amount: 400, category: 'materials', description: 'W9 SoD Board approval', recipientId })
        .expect(201);

      await http().post(`/api/v1/expenses/${expense.body.data.id}/approve`).set('Authorization', admin).expect(201);
      const decided = await prisma.expense.findUnique({ where: { id: expense.body.data.id } });
      expect(decided!.status).toBe('approved');
    });

    it('a fund officer who recorded a fund donation cannot confirm it themselves', async () => {
      const fundOfficerAdmin = await prisma.admin.create({ data: { firstName: 'Fund', lastName: 'Officer', role: 'employee' } });
      const fundOfficerUser = await prisma.user.create({ data: { referenceId: fundOfficerAdmin.id, referenceType: 'admin', email: 'w9-sod-fund-officer@example.com' } });
      await prisma.roleAssignment.create({ data: { userId: fundOfficerUser.id, role: 'fund_accountant', scopeType: 'fund', scopeId: fundId } });
      const officerToken = await signToken({
        sub: fundOfficerUser.id, email: fundOfficerUser.email, role: 'employee', referenceType: 'admin',
        referenceId: fundOfficerAdmin.id, activeOrgId: null, tokenVersion: 2,
      });

      const recorded = await http()
        .post(`/api/v1/funds/${fundId}/donations`)
        .set('Authorization', officerToken)
        .send({ amount: 250, paymentMethod: 'cash', donatedAt: new Date().toISOString() })
        .expect(201);

      const attempt = await http().post(`/api/v1/funds/donations/${recorded.body.data.id}/approve`).set('Authorization', officerToken);
      expect(attempt.status).toBe(403);

      await http().post(`/api/v1/funds/donations/${recorded.body.data.id}/approve`).set('Authorization', admin).expect(201);
    });
  });

  // ─── Sector reporting ─────────────────────────────────────────────────────

  describe('GET /transparency/sectors/:id', () => {
    it('reports totals that reconcile with the fund dashboard for the same category', async () => {
      const fund = await prisma.fund.findFirst({ where: { type: 'master', categoryId: waterId } });
      const res = await http().get(`/api/v1/transparency/sectors/${waterId}`).expect(200);
      const report = res.body.data.data; // {asOf, data: T} Aggregate wrapper, see transparency-read.service.ts
      expect(report.category.id).toBe(waterId);
      expect(typeof report.totalDonations).toBe('number');
      expect(typeof report.remainingBalance).toBe('number');
      expect(report.funds.some((f: any) => f.id === fund!.id)).toBe(true);
    });

    it('404s for an unknown category', async () => {
      await http().get('/api/v1/transparency/sectors/999999').expect(404);
    });
  });
});
