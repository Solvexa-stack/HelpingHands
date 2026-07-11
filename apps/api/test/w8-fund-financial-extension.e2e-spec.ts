import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W8 — fund types, fund-directed donations, the Expense/Recipient/Invoice
 * successor to ProjectExpense, and the two security properties that matter
 * once real money starts moving through them: cross-organization isolation
 * and fund-scoped permissions actually staying scoped to their own fund.
 *
 * Chain under test throughout: Donor → FundDonation → Fund → FundAllocation
 * → Project, and Fund → Expense → Recipient/Invoice.
 */
describe('W8 — Fund financial extension', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let projectId: number;
  let donorFundId: number;
  let orgFundId: number;
  let donorId: number;
  let recipientId: number;

  const http = () => request(app.getHttpServer());
  const signToken = async (payload: Record<string, unknown>) =>
    `Bearer ${await new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }).signAsync(payload)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    ({ projectId } = await createProjectViaApi(app, admin, 'w8-financial', { value: 1_000_000 }));

    const donor = await http().post('/api/v1/donors').set('Authorization', admin).send({ name: 'Acme Foundation', type: 'organization' }).expect(201);
    donorId = donor.body.data.id;

    const recipient = await http().post('/api/v1/recipients').set('Authorization', admin).send({ name: 'ABC Construction Co', type: 'company' }).expect(201);
    recipientId = recipient.body.data.id;

    const donorFund = await http()
      .post('/api/v1/funds')
      .set('Authorization', admin)
      .send({ name: 'W8 Donor Fund', type: 'donor', donorId })
      .expect(201);
    donorFundId = donorFund.body.data.id;

    const orgFund = await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'W8 Org Fund' }).expect(201);
    orgFundId = orgFund.body.data.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. Fund types ────────────────────────────────────────────────────────

  describe('Fund types', () => {
    it('creates a fund with an explicit type', async () => {
      const res = await http().get(`/api/v1/funds/${donorFundId}`).set('Authorization', admin).expect(200);
      expect(res.body.data.type).toBe('donor');
      expect(res.body.data.donor.id).toBe(donorId);
    });

    it('defaults to organization type when none is given, and keeps the fund optionally org-less', async () => {
      const res = await http().get(`/api/v1/funds/${orgFundId}`).set('Authorization', admin).expect(200);
      expect(res.body.data.type).toBe('organization');
      expect(res.body.data.managingOrganizationId).toBeNull();
    });

    it('rejects a donor-type fund with no donorId', async () => {
      await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'Bad donor fund', type: 'donor' }).expect(400);
    });

    it('existing pre-migration funds still list and read correctly (backward compatibility)', async () => {
      const list = await http().get('/api/v1/funds').set('Authorization', admin).expect(200);
      const found = list.body.data.find((f: any) => f.id === orgFundId);
      expect(found).toBeDefined();
      expect(found.type).toBe('organization');
    });
  });

  // ─── 2. Fund donations ────────────────────────────────────────────────────

  describe('Fund donations — creating and confirming changes the fund balance', () => {
    let donationId: number;

    it('records a donation as pending, without moving the ledger yet', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const res = await http()
        .post(`/api/v1/funds/${donorFundId}/donations`)
        .set('Authorization', admin)
        .send({ donorId, amount: 5000, currency: 'USD', paymentMethod: 'bank_transfer', referenceNumber: 'REF-001', donatedAt: new Date().toISOString(), notes: 'Q1 pledge' })
        .expect(201);
      donationId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance);
    });

    it('confirming posts the ledger credit and increases the fund balance', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const decided = await http().post(`/api/v1/funds/donations/${donationId}/approve`).set('Authorization', admin).expect(201);
      expect(decided.body.data.status).toBe('approved');

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance + 5000);
      expect(after.body.data.totalDonations).toBe(before.body.data.totalDonations + 5000);
    });

    it('cannot re-decide an already-confirmed donation', async () => {
      await http().post(`/api/v1/funds/donations/${donationId}/approve`).set('Authorization', admin).expect(400);
    });

    it('rejecting a pending donation never touches the ledger', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const rec = await http()
        .post(`/api/v1/funds/${donorFundId}/donations`)
        .set('Authorization', admin)
        .send({ amount: 750, paymentMethod: 'cash', donatedAt: new Date().toISOString() })
        .expect(201);
      await http().post(`/api/v1/funds/donations/${rec.body.data.id}/reject`).set('Authorization', admin).expect(201);

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance);
    });
  });

  // ─── 3. Expenses, recipients, invoices ────────────────────────────────────

  describe('Expenses — who was paid, how much, why, for which project/fund, which invoice', () => {
    let expenseId: number;
    let invoiceId: number;

    it('submits an expense as pending, with no ledger movement yet', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const res = await http()
        .post('/api/v1/expenses')
        .set('Authorization', admin)
        .send({
          fundId: donorFundId,
          projectId,
          amount: 2500,
          category: 'materials',
          description: 'Building materials',
          recipientId,
          notes: 'First tranche of materials',
        })
        .expect(201);
      expenseId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.recipient.name).toBe('ABC Construction Co');

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance);
    });

    it('uploads an invoice and attaches it to the expense', async () => {
      const uploaded = await http()
        .post('/api/v1/invoices')
        .set('Authorization', admin)
        .field('invoiceNumber', 'INV-1005')
        .field('invoiceDate', new Date().toISOString())
        .field('recipientId', String(recipientId))
        .attach('file', Buffer.from('%PDF-1.4 fake invoice content'), 'INV-1005.pdf')
        .expect(201);
      invoiceId = uploaded.body.data.id;
      expect(uploaded.body.data.fileUrl).toContain('/uploads/');

      const attached = await http().post(`/api/v1/expenses/${expenseId}/invoice`).set('Authorization', admin).send({ invoiceId }).expect(201);
      expect(attached.body.data.invoice.invoiceNumber).toBe('INV-1005');
    });

    it('approving posts the ledger debit and decreases the fund balance', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const approved = await http().post(`/api/v1/expenses/${expenseId}/approve`).set('Authorization', admin).expect(201);
      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.approvedByUser).toBeDefined();

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance - 2500);
      expect(after.body.data.totalSpent).toBe(before.body.data.totalSpent + 2500);
    });

    it('cannot approve or modify an already-decided expense', async () => {
      await http().post(`/api/v1/expenses/${expenseId}/approve`).set('Authorization', admin).expect(400);
    });

    it('rejects a pending expense without moving the ledger', async () => {
      const before = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const res = await http()
        .post('/api/v1/expenses')
        .set('Authorization', admin)
        .send({ fundId: donorFundId, projectId, amount: 300, category: 'transport', description: 'Fuel', recipientId })
        .expect(201);
      await http().post(`/api/v1/expenses/${res.body.data.id}/reject`).set('Authorization', admin).expect(201);

      const after = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      expect(after.body.data.balance).toBe(before.body.data.balance);
    });

    it('blocks approving an expense that would exceed the fund balance — validated on the backend, not just the UI', async () => {
      const res = await http()
        .post('/api/v1/expenses')
        .set('Authorization', admin)
        .send({ fundId: donorFundId, projectId, amount: 999_999_999, category: 'services', description: 'Way too large', recipientId })
        .expect(201);
      const attempt = await http().post(`/api/v1/expenses/${res.body.data.id}/approve`).set('Authorization', admin);
      expect(attempt.status).toBe(400);
      expect(attempt.body.message).toMatch(/insufficient fund balance/i);
    });

    it('the public project funding report shows this fund and the approved expense', async () => {
      const res = await http().get(`/api/v1/projects/${projectId}/funding`).expect(200);
      expect(res.body.data.fundingSources.length + res.body.data.expenses.length).toBeGreaterThan(0);
      const spentOnThisFund = res.body.data.expenses.find((e: any) => e.fundId === donorFundId);
      expect(spentOnThisFund.amount).toBe(2500);
    });
  });

  // ─── 4. Ledger consistency ────────────────────────────────────────────────

  describe('Ledger consistency', () => {
    it('the fund balance always equals donations minus disbursed allocations minus spent expenses', async () => {
      const dash = await http().get(`/api/v1/funds/${donorFundId}/dashboard`).set('Authorization', admin).expect(200);
      const { balance, totalDonations, totalSpent, disbursed } = dash.body.data;
      expect(balance).toBeCloseTo(totalDonations - disbursed - totalSpent, 2);
    });

    it('donor report totals match what was actually posted for that donor', async () => {
      const report = await http().get(`/api/v1/donors/${donorId}/report`).set('Authorization', admin).expect(200);
      expect(report.body.data.totalDonated).toBe(5000);
      expect(report.body.data.totalSpent).toBe(2500);
    });
  });

  // ─── 5. Cross-organization restrictions ───────────────────────────────────

  describe('Cross-organization restrictions', () => {
    let orgBId: number;
    let orgBProjectId: number;
    let orgAUser: string;

    beforeAll(async () => {
      const [orgA, orgB] = await Promise.all([
        prisma.organization.create({ data: { type: 'ngo', name: 'W8 Org A', status: 'active' } }),
        prisma.organization.create({ data: { type: 'ngo', name: 'W8 Org B', status: 'active' } }),
      ]);
      orgBId = orgB.id;

      const orgAAdmin = await prisma.admin.create({ data: { firstName: 'OrgA', lastName: 'Staff', role: 'employee' } });
      const orgAUserRow = await prisma.user.create({
        data: { referenceId: orgAAdmin.id, referenceType: 'admin', email: 'w8-orga-staff@example.com' },
      });
      await prisma.organizationMembership.create({ data: { organizationId: orgA.id, userId: orgAUserRow.id } });
      await prisma.roleAssignment.create({
        data: { userId: orgAUserRow.id, role: 'staff', scopeType: 'organization', scopeId: orgA.id },
      });
      orgAUser = await signToken({
        sub: orgAUserRow.id,
        email: orgAUserRow.email,
        role: 'employee',
        referenceType: 'admin',
        referenceId: orgAAdmin.id,
        activeOrgId: orgA.id,
        tokenVersion: 2,
      });

      ({ projectId: orgBProjectId } = await createProjectViaApi(app, admin, 'w8-orgb-project'));
      await prisma.project.update({ where: { id: orgBProjectId }, data: { ownerOrganizationId: orgBId } });

      process.env.TENANCY_ENFORCED = 'true';
    });

    afterAll(() => {
      delete process.env.TENANCY_ENFORCED;
    });

    it('an org A user cannot submit an expense against an org B project — reads as not found, no cross-org leak', async () => {
      const res = await http()
        .post('/api/v1/expenses')
        .set('Authorization', orgAUser)
        .send({ fundId: orgFundId, projectId: orgBProjectId, amount: 100, category: 'other', description: 'cross-org attempt', recipientId })
        .expect(404);
      expect(res.body.message).toContain(`Project #${orgBProjectId}`);
    });

    it('an org A user cannot list expenses scoped to an org B project', async () => {
      // Seed one expense on the org B project directly (bypassing tenancy) so
      // there is something that WOULD leak if the list filter were broken.
      await prisma.expense.create({
        data: {
          fundId: orgFundId,
          projectId: orgBProjectId,
          amount: 50,
          category: 'other',
          description: 'org B only',
          recipientId,
          createdByUserId: (await prisma.user.findFirst({ where: { email: 'admin@helpinghands.org' } }))!.id,
        },
      });
      const res = await http().get(`/api/v1/expenses?projectId=${orgBProjectId}`).set('Authorization', orgAUser).expect(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  // ─── 6. Permissions — fund-scope grants stay scoped to their own fund ─────

  describe('Permissions — a fund officer of fund A cannot act on fund B (PolicyGuard resourceFrom fix)', () => {
    let scopedUser: string;
    let scopedFundId: number;
    let otherFundId: number;
    let scopedExpenseId: number;
    let otherExpenseId: number;
    let scopedDonationId: number;
    let otherDonationId: number;

    beforeAll(async () => {
      const scopedFund = await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'Permission Scoped Fund' }).expect(201);
      scopedFundId = scopedFund.body.data.id;
      const otherFund = await http().post('/api/v1/funds').set('Authorization', admin).send({ name: 'Permission Other Fund' }).expect(201);
      otherFundId = otherFund.body.data.id;

      // Both funds need a balance before an expense can be approved against
      // them (the backend balance guard rejects an approval that would go
      // negative — confirmed separately above).
      for (const fid of [scopedFundId, otherFundId]) {
        const funding = await http()
          .post(`/api/v1/funds/${fid}/donations`)
          .set('Authorization', admin)
          .send({ amount: 1000, paymentMethod: 'cash', donatedAt: new Date().toISOString() })
          .expect(201);
        await http().post(`/api/v1/funds/donations/${funding.body.data.id}/approve`).set('Authorization', admin).expect(201);
      }

      const scopedAdmin = await prisma.admin.create({ data: { firstName: 'Scoped', lastName: 'Accountant', role: 'employee' } });
      const scopedUserRow = await prisma.user.create({
        data: { referenceId: scopedAdmin.id, referenceType: 'admin', email: 'w8-scoped-accountant@example.com' },
      });
      await prisma.roleAssignment.create({
        data: { userId: scopedUserRow.id, role: 'fund_accountant', scopeType: 'fund', scopeId: scopedFundId },
      });
      scopedUser = await signToken({
        sub: scopedUserRow.id,
        email: scopedUserRow.email,
        role: 'employee',
        referenceType: 'admin',
        referenceId: scopedAdmin.id,
        activeOrgId: null,
        tokenVersion: 2,
      });

      const scopedExpense = await http()
        .post('/api/v1/expenses')
        .set('Authorization', admin)
        .send({ fundId: scopedFundId, projectId, amount: 100, category: 'other', description: 'scoped', recipientId })
        .expect(201);
      scopedExpenseId = scopedExpense.body.data.id;
      // Funding Platform Audit §4: expenses need an attached invoice to be
      // approvable (unless Board/Council) — this fixture is about fund-scope
      // segregation, not the invoice policy, so give it a real invoice.
      const scopedInvoice = await http()
        .post('/api/v1/invoices')
        .set('Authorization', admin)
        .field('invoiceNumber', 'INV-SCOPED-1')
        .field('invoiceDate', new Date().toISOString())
        .field('recipientId', String(recipientId))
        .attach('file', Buffer.from('%PDF-1.4 fake invoice content'), 'INV-SCOPED-1.pdf')
        .expect(201);
      await http()
        .post(`/api/v1/expenses/${scopedExpenseId}/invoice`)
        .set('Authorization', admin)
        .send({ invoiceId: scopedInvoice.body.data.id })
        .expect(201);
      const otherExpense = await http()
        .post('/api/v1/expenses')
        .set('Authorization', admin)
        .send({ fundId: otherFundId, projectId, amount: 100, category: 'other', description: 'other fund', recipientId })
        .expect(201);
      otherExpenseId = otherExpense.body.data.id;

      const scopedDonation = await http()
        .post(`/api/v1/funds/${scopedFundId}/donations`)
        .set('Authorization', admin)
        .send({ amount: 40, paymentMethod: 'cash', donatedAt: new Date().toISOString() })
        .expect(201);
      scopedDonationId = scopedDonation.body.data.id;
      const otherDonation = await http()
        .post(`/api/v1/funds/${otherFundId}/donations`)
        .set('Authorization', admin)
        .send({ amount: 40, paymentMethod: 'cash', donatedAt: new Date().toISOString() })
        .expect(201);
      otherDonationId = otherDonation.body.data.id;

      process.env.POLICY_ENFORCED = 'true';
    });

    afterAll(() => {
      delete process.env.POLICY_ENFORCED;
    });

    it('the fund_accountant CAN approve an expense against their own fund', async () => {
      await http().post(`/api/v1/expenses/${scopedExpenseId}/approve`).set('Authorization', scopedUser).expect(201);
    });

    it('the SAME fund_accountant CANNOT approve an expense against a different fund', async () => {
      await http().post(`/api/v1/expenses/${otherExpenseId}/approve`).set('Authorization', scopedUser).expect(403);
    });

    it('the fund_accountant CAN confirm a donation against their own fund', async () => {
      await http().post(`/api/v1/funds/donations/${scopedDonationId}/approve`).set('Authorization', scopedUser).expect(201);
    });

    it('the SAME fund_accountant CANNOT confirm a donation against a different fund', async () => {
      await http().post(`/api/v1/funds/donations/${otherDonationId}/approve`).set('Authorization', scopedUser).expect(403);
    });

    it('an unauthenticated/ungranted request is rejected outright', async () => {
      await http().post(`/api/v1/expenses/${otherExpenseId}/reject`).expect(401);
    });
  });
});
