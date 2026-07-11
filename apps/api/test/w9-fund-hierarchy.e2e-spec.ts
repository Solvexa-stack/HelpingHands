import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi } from './utils/fixtures';

/**
 * W9 — the fund hierarchy: Master Fund (mirrors the ProjectCategoryNode
 * taxonomy 1:1, including nesting) → Organization Fund (one per org ×
 * category, parented under that category's master fund) → Project (via
 * primaryFundId, auto-resolved at creation). Plus the direct-donation
 * auto-allocation chain: Donation → default Fund → auto FundAllocation →
 * Project.
 */
describe('W9 — Fund hierarchy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let infrastructureId: number;
  let waterId: number;
  let orgAId: number;
  let orgBId: number;
  let orgAToken: string;
  let orgBToken: string;

  const http = () => request(app.getHttpServer());

  const signToken = async (payload: Record<string, unknown>) =>
    `Bearer ${await new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }).signAsync(payload)}`;

  /** A staff user whose activeOrgId is `organizationId`, so project creation attributes ownership correctly from the start (fund auto-resolution reads actor.activeOrgId, not a later patch). */
  async function orgScopedToken(organizationId: number, email: string): Promise<string> {
    const orgAdmin = await prisma.admin.create({ data: { firstName: 'Org', lastName: 'Staff', role: 'employee' } });
    const user = await prisma.user.create({ data: { referenceId: orgAdmin.id, referenceType: 'admin', email } });
    await prisma.organizationMembership.create({ data: { organizationId, userId: user.id } });
    await prisma.roleAssignment.create({ data: { userId: user.id, role: 'staff', scopeType: 'organization', scopeId: organizationId } });
    return signToken({
      sub: user.id, email: user.email, role: 'employee', referenceType: 'admin',
      referenceId: orgAdmin.id, activeOrgId: organizationId, tokenVersion: 2,
    });
  }

  async function createProjectInCategory(orgToken: string, categoryKey: string, slug: string, value = 10_000) {
    const blockId = await createBlockViaApi(app, admin, `w9-${slug}`);
    const res = await http()
      .post('/api/v1/projects')
      .set('Authorization', orgToken)
      .send({ blockId, value, categoryKey })
      .expect(201);
    return res.body.data.id as number;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    const infrastructure = await prisma.projectCategoryNode.findUnique({ where: { key: 'infrastructure' } });
    const water = await prisma.projectCategoryNode.findUnique({ where: { key: 'water' } });
    infrastructureId = infrastructure!.id;
    waterId = water!.id;

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { type: 'ngo', name: 'W9 Red Crescent', status: 'active' } }),
      prisma.organization.create({ data: { type: 'ngo', name: 'W9 Blue Cross', status: 'active' } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;
    [orgAToken, orgBToken] = await Promise.all([
      orgScopedToken(orgAId, 'w9-orga-staff@example.com'),
      orgScopedToken(orgBId, 'w9-orgb-staff@example.com'),
    ]);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  describe('Automatic fund creation on project creation', () => {
    it('creates the master fund and an organization fund the first time an org uses a category', async () => {
      const projectId = await createProjectInCategory(orgAToken, 'water', 'first-water');
      const project = await http().get(`/api/v1/projects/${projectId}`).expect(200);
      const fundId = project.body.data.primaryFundId;
      expect(fundId).not.toBeNull();

      const fund = await http().get(`/api/v1/funds/${fundId}`).set('Authorization', admin).expect(200);
      expect(fund.body.data.type).toBe('organization');
      expect(fund.body.data.categoryId).toBe(waterId);
      expect(fund.body.data.managingOrganizationId).toBe(orgAId);
      expect(fund.body.data.name).toContain('Water');
      expect(fund.body.data.name).toContain('Red Crescent');

      // its parent is Water's master fund, which is itself parented under Infrastructure's master fund
      const masterFund = await prisma.fund.findUnique({ where: { id: fund.body.data.parentFundId } });
      expect(masterFund!.type).toBe('master');
      expect(masterFund!.categoryId).toBe(waterId);
      const grandparent = await prisma.fund.findUnique({ where: { id: masterFund!.parentFundId! } });
      expect(grandparent!.type).toBe('master');
      expect(grandparent!.categoryId).toBe(infrastructureId);
    });

    it('reuses the same organization fund for a second project in the same org+category (no duplicate)', async () => {
      const firstProjectId = await createProjectInCategory(orgAToken, 'water', 'second-water');
      const first = await http().get(`/api/v1/projects/${firstProjectId}`).expect(200);

      const secondProjectId = await createProjectInCategory(orgAToken, 'water', 'third-water');
      const second = await http().get(`/api/v1/projects/${secondProjectId}`).expect(200);

      expect(second.body.data.primaryFundId).toBe(first.body.data.primaryFundId);

      const orgFundCount = await prisma.fund.count({
        where: { type: 'organization', categoryId: waterId, managingOrganizationId: orgAId },
      });
      expect(orgFundCount).toBe(1);
    });

    it('a different organization in the same category gets its OWN fund, parented under the SAME (reused) master fund', async () => {
      const projectId = await createProjectInCategory(orgBToken, 'water', 'orgb-water');
      const project = await http().get(`/api/v1/projects/${projectId}`).expect(200);
      const fund = await http().get(`/api/v1/funds/${project.body.data.primaryFundId}`).set('Authorization', admin).expect(200);
      expect(fund.body.data.managingOrganizationId).toBe(orgBId);

      const masterFundCount = await prisma.fund.count({ where: { type: 'master', categoryId: waterId } });
      expect(masterFundCount).toBe(1); // still exactly one master fund for water
    });

    it('an explicit fundId on project creation overrides the auto-default', async () => {
      const manualFund = await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'W9 Manual Override Fund' }).expect(201);
      const blockId = await createBlockViaApi(app, admin, 'w9-manual-override');
      const res = await http()
        .post('/api/v1/projects')
        .set('Authorization', admin)
        .send({ blockId, value: 5000, categoryKey: 'water', fundId: manualFund.body.data.id })
        .expect(201);
      expect(res.body.data.primaryFundId).toBe(manualFund.body.data.id);
    });
  });

  describe('GET /funds/hierarchy', () => {
    it('returns master funds at the root, with organization funds nested underneath', async () => {
      const res = await http().get('/api/v1/funds/hierarchy').set('Authorization', admin).expect(200);
      const infra = res.body.data.roots.find((f: any) => f.categoryId === infrastructureId);
      expect(infra).toBeDefined();
      expect(infra.type).toBe('master');
      const waterNode = infra.children.find((f: any) => f.categoryId === waterId);
      expect(waterNode).toBeDefined();
      expect(waterNode.children.length).toBeGreaterThanOrEqual(2); // org A and org B water funds
      expect(waterNode.children.every((c: any) => c.type === 'organization')).toBe(true);
    });

    it('surfaces pre-W9 flat funds separately so nothing disappears', async () => {
      const res = await http().get('/api/v1/funds/hierarchy').set('Authorization', admin).expect(200);
      // seeded flat funds (Development & Infrastructure, Social Support, ...) have no category/parent
      expect(res.body.data.unattached.length).toBeGreaterThan(0);
      expect(res.body.data.unattached.every((f: any) => f.categoryId == null)).toBe(true);
    });
  });

  describe('Direct project donation auto-allocation (Donation → Fund → auto FundAllocation → Project)', () => {
    let projectId: number;
    let fundId: number;
    let participantToken: string;

    beforeAll(async () => {
      projectId = await createProjectInCategory(orgAToken, 'water', 'donation-target');
      const project = await http().get(`/api/v1/projects/${projectId}`).expect(200);
      fundId = project.body.data.primaryFundId;
      participantToken = await authHeaderFor(prisma, 'participant');
    });

    it('a QR/cash donation creates the pending donation as usual', async () => {
      const res = await http()
        .post('/api/v1/donations')
        .set('Authorization', participantToken)
        .send({ projectId, amount: 750 })
        .expect(201);
      expect(res.body.data.status).toBe('pending');
    });

    it('approving it auto-allocates through the default fund: fund nets to zero, project account gets the money, a reconciled FundAllocation exists', async () => {
      const pending = await prisma.projectDonation.findFirst({ where: { projectId, amount: 750 }, orderBy: { id: 'desc' } });

      const fundBefore = await http().get(`/api/v1/funds/${fundId}/dashboard`).set('Authorization', admin).expect(200);

      await http().patch(`/api/v1/donations/${pending!.id}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);

      const fundAfter = await http().get(`/api/v1/funds/${fundId}/dashboard`).set('Authorization', admin).expect(200);
      // credited then immediately re-allocated out — nets to zero, it's a pass-through
      expect(fundAfter.body.data.balance).toBe(fundBefore.body.data.balance);

      const allocation = await prisma.fundAllocation.findFirst({
        where: { fundId, projectId, note: { contains: `donation #${pending!.id}` } },
      });
      expect(allocation).not.toBeNull();
      expect(allocation!.status).toBe('reconciled');
      expect(Number(allocation!.amount)).toBe(750);

      const projectReport = await http().get(`/api/v1/projects/${projectId}/funding`).expect(200);
      const source = projectReport.body.data.fundingSources.find((f: any) => f.fundId === fundId);
      expect(source.amount).toBe(750);
    });

    it('re-approving is a no-op (idempotent) and does not double-allocate', async () => {
      const donation = await prisma.projectDonation.findFirst({ where: { projectId, amount: 750 } });
      const res = await http().patch(`/api/v1/donations/${donation!.id}/status`).set('Authorization', admin).send({ status: 'approved' });
      expect(res.status).toBe(400); // DonationsService already blocks re-approval — belt-and-suspenders confirmed below
      const allocationCount = await prisma.fundAllocation.count({ where: { fundId, projectId, note: { contains: `donation #${donation!.id}` } } });
      expect(allocationCount).toBe(1);
    });
  });

  describe('Backward compatibility — a project with no default fund keeps the original direct posting', () => {
    it('a legacy-shaped project (primaryFundId null) posts a donation straight into its own project account', async () => {
      const blockId = await createBlockViaApi(app, admin, 'w9-legacy-no-fund');
      const legacyProject = await http()
        .post('/api/v1/projects')
        .set('Authorization', admin)
        .send({ blockId, value: 2000, categoryKey: 'water', fundId: undefined })
        .expect(201);
      const projectId = legacyProject.body.data.id;
      // simulate a pre-W9 project: no primary fund of record
      await prisma.project.update({ where: { id: projectId }, data: { primaryFundId: null } });

      const participantToken = await authHeaderFor(prisma, 'participant');
      const donation = await http().post('/api/v1/donations').set('Authorization', participantToken).send({ projectId, amount: 300 }).expect(201);
      await http().patch(`/api/v1/donations/${donation.body.data.id}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);

      // no auto-allocation should exist for this project — money went straight to the project account
      const allocationCount = await prisma.fundAllocation.count({ where: { projectId } });
      expect(allocationCount).toBe(0);

      const report = await http().get(`/api/v1/projects/${projectId}/funding`).expect(200);
      expect(report.body.data.fundingSources).toEqual([]);
    });
  });
});
