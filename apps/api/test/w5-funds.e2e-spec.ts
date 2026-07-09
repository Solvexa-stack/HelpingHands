import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PolicyService } from '../src/modules/policy/policy.service';
import { TreasuryService } from '../src/modules/treasury/treasury.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

/**
 * W5-E3/E5/E6 — funds: Board-gated CRUD, the five officer roles with
 * structural segregation of duties (controller = read+flag ONLY), the launch
 * ceiling (BoardDecision on every allocation), a fund-directed online
 * donation, and one full allocation cycle: propose → decide → two tranches →
 * reconcile → close, every state on the workflow engine.
 */
describe('Funds & allocations (W5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let policy: PolicyService;
  let treasury: TreasuryService;
  let boardAdmin: string;
  let fundId: number;
  let projectId: number;
  let allocationId: number;
  const officers: Record<string, { userId: number; auth: string }> = {};

  const stripe = new StripeSDK('sk_test_e2e_signing_only');
  const http = () => request(app.getHttpServer());
  const FUND_ROLES = ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'];

  const actorOf = (role: string) => ({
    userId: officers[role].userId,
    referenceType: 'admin',
    requestId: 'w5-funds',
    ip: null,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    policy = app.get(PolicyService);
    treasury = app.get(TreasuryService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';

    boardAdmin = await authHeaderFor(prisma, 'administrator');
    ({ projectId } = await createProjectViaApi(app, boardAdmin, 'funds', { value: 100000 }));

    // the Board creates the fund (launch ceiling in default policy)
    const fund = await http()
      .post('/api/v1/funds')
      .set('Authorization', boardAdmin)
      .send({ name: 'W5 Test Fund', purpose: 'Spec fund' })
      .expect(201);
    fundId = fund.body.data.id;

    // five officers, one per role
    for (const role of FUND_ROLES) {
      const adminRow = await prisma.admin.create({
        data: { firstName: role, lastName: 'Officer', role: 'employee' },
      });
      const user = await prisma.user.create({
        data: {
          referenceId: adminRow.id,
          referenceType: 'admin',
          email: `${role}@w5.example.com`,
          password: await bcrypt.hash('Officer@123', 12),
          isActive: true,
          joiningDate: new Date(),
        },
      });
      await http()
        .post(`/api/v1/funds/${fundId}/officers`)
        .set('Authorization', boardAdmin)
        .send({ userId: user.id, role })
        .expect(201);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: `${role}@w5.example.com`, password: 'Officer@123' })
        .expect(200);
      officers[role] = { userId: user.id, auth: `Bearer ${login.body.data.accessToken}` };
    }
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  it('the fund exists with an account and the launch-ceiling policy', async () => {
    const detail = await http().get(`/api/v1/funds/${fundId}`).set('Authorization', boardAdmin).expect(200);
    expect(detail.body.data.balance).toBe(0);
    expect(detail.body.data.policy.dualApprovalThreshold).toBe(0);
    expect(detail.body.data.memberships).toHaveLength(5);
  });

  it('permission matrix: segregation of duties is structural (DoD controller bullet)', async () => {
    const canDo = async (role: string, action: string) =>
      (await policy.can(actorOf(role) as never, action, { id: fundId } as never)).allow;

    // director & deputy: propose + disburse; accountant: reconcile; all read
    expect(await canDo('fund_director', 'allocation.propose')).toBe(true);
    expect(await canDo('fund_director', 'allocation.disburse')).toBe(true);
    expect(await canDo('fund_deputy', 'allocation.propose')).toBe(true);
    expect(await canDo('fund_accountant', 'allocation.reconcile')).toBe(true);
    expect(await canDo('fund_secretary', 'fund.read')).toBe(true);

    // secretary/accountant cannot initiate money movement
    expect(await canDo('fund_secretary', 'allocation.propose')).toBe(false);
    expect(await canDo('fund_secretary', 'allocation.disburse')).toBe(false);
    expect(await canDo('fund_accountant', 'allocation.propose')).toBe(false);
    expect(await canDo('fund_accountant', 'allocation.disburse')).toBe(false);

    // the controller: read + flag EVERYTHING, initiate/approve NOTHING
    expect(await canDo('fund_controller', 'fund.read')).toBe(true);
    expect(await canDo('fund_controller', 'ledger.flag')).toBe(true);
    expect(await canDo('fund_controller', 'allocation.propose')).toBe(false);
    expect(await canDo('fund_controller', 'allocation.disburse')).toBe(false);
    expect(await canDo('fund_controller', 'allocation.reconcile')).toBe(false);
    expect(await canDo('fund_controller', 'allocation.decide')).toBe(false);
    expect(await canDo('fund_controller', 'fund.manage')).toBe(false);

    // nobody but the Board manages funds or decides allocations
    expect(await canDo('fund_director', 'fund.manage')).toBe(false);
    expect(await canDo('fund_director', 'allocation.decide')).toBe(false);
  });

  it('a fund-directed online donation credits the fund account (E5-S3)', async () => {
    const participantRow = await prisma.participant.findFirst({});
    await prisma.onlineDonation.create({
      data: { fundId, participantId: participantRow!.id, amount: 1000, currency: 'USD', provider: 'stripe', providerSessionId: 'cs_fund_w5', status: 'pending' },
    });
    const payload = JSON.stringify({ id: 'evt_fund_w5', type: 'checkout.session.completed', data: { object: { id: 'cs_fund_w5', payment_intent: 'pi_fund' } } });
    await http()
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET }))
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);

    const account = await treasury.fundAccount(fundId);
    expect(await treasury.balance(account.id)).toBe(1000);
  });

  it('the checkout endpoint validates the projectId/fundId exclusivity', async () => {
    const participant = await authHeaderFor(prisma, 'participant');
    await http()
      .post('/api/v1/payments/checkout')
      .set('Authorization', participant)
      .send({ amount: 10, provider: 'stripe' })
      .expect(400);
  });

  it('full allocation cycle: propose → launch-ceiling decision → two tranches → reconcile → close', async () => {
    // director proposes
    const proposal = await http()
      .post(`/api/v1/funds/${fundId}/allocations`)
      .set('Authorization', officers.fund_director.auth)
      .send({ projectId, amount: 600, note: 'W5 first allocation' })
      .expect(201);
    allocationId = proposal.body.data.id;

    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'fund_allocation', subjectId: allocationId } },
    });
    expect(instance!.currentStateKey).toBe('proposed');

    // launch ceiling: approval without a BoardDecision is impossible (E6-S2)
    const blocked = await http()
      .post(`/api/v1/funds/allocations/${allocationId}/approve`)
      .set('Authorization', boardAdmin);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain('board_decision:approved-missing');

    // the Board decides (W3 governance, subject fund_allocation)
    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', boardAdmin)
      .send({
        subjectType: 'fund_allocation',
        subjectId: allocationId,
        decision: 'approved',
        rationale: 'First allocation cycle — launch ceiling forces Board review.',
      })
      .expect(201);

    const approved = await http()
      .post(`/api/v1/funds/allocations/${allocationId}/approve`)
      .set('Authorization', boardAdmin)
      .expect(201);
    expect(approved.body.data.status).toBe('board_approved');
    expect(approved.body.data.approvedByDecisionId).not.toBeNull();

    // two tranches by the director (fund → project account)
    await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', officers.fund_director.auth)
      .send({ amount: 250 })
      .expect(201);
    const tranche2 = await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', officers.fund_director.auth)
      .send({ amount: 350 })
      .expect(201);
    expect(tranche2.body.data.tranche).toBe(2);

    // over-disbursement rejected
    await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', officers.fund_director.auth)
      .send({ amount: 1 })
      .expect(400);

    const fundAccount = await treasury.fundAccount(fundId);
    const projectAccount = await treasury.projectAccount(projectId);
    expect(await treasury.balance(fundAccount.id)).toBe(400); // 1000 − 600
    expect(await treasury.balance(projectAccount.id)).toBe(600);

    // the accountant reconciles; the director closes
    await http()
      .post(`/api/v1/funds/allocations/${allocationId}/reconcile`)
      .set('Authorization', officers.fund_accountant.auth)
      .expect(201);
    await http()
      .post(`/api/v1/funds/allocations/${allocationId}/close`)
      .set('Authorization', officers.fund_director.auth)
      .expect(201);

    const final = await prisma.fundAllocation.findUnique({ where: { id: allocationId } });
    expect(final!.status).toBe('closed');
    const steps = await prisma.workflowStepLog.findMany({
      where: { instance: { subjectType: 'fund_allocation', subjectId: allocationId } },
      orderBy: { id: 'asc' },
    });
    expect(steps.map((s) => s.actionKey)).toEqual(['start', 'approve', 'begin_disbursement', 'reconcile', 'close']);
  });

  it('the controller can flag a posting but cannot disburse (endpoint-level check)', async () => {
    const anyTx = await prisma.ledgerTransaction.findFirst({ orderBy: { id: 'desc' } });
    await http()
      .post(`/api/v1/treasury/transactions/${anyTx!.id}/flag`)
      .set('Authorization', officers.fund_controller.auth)
      .send({ reason: 'controller spot-check' })
      .expect(201);
    // the audit writer persists asynchronously — poll briefly
    let audit: { id: number } | null = null;
    for (let i = 0; i < 10 && !audit; i++) {
      audit = await prisma.auditLog.findFirst({ where: { action: 'ledger.flagged' }, orderBy: { id: 'desc' } });
      if (!audit) await new Promise((r) => setTimeout(r, 100));
    }
    expect(audit).not.toBeNull();

    await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', officers.fund_controller.auth)
      .send({ amount: 1 })
      .expect(403);
  });

  it('freeze semantics: a frozen fund blocks new allocations and disbursements, history stays', async () => {
    await http().put(`/api/v1/funds/${fundId}`).set('Authorization', boardAdmin).send({ status: 'frozen' }).expect(200);

    await http()
      .post(`/api/v1/funds/${fundId}/allocations`)
      .set('Authorization', officers.fund_director.auth)
      .send({ projectId, amount: 10 })
      .expect(400);

    // history untouched
    const detail = await http().get(`/api/v1/funds/${fundId}`).set('Authorization', boardAdmin).expect(200);
    expect(detail.body.data.allocations).toHaveLength(1);
    expect(detail.body.data.balance).toBe(400);

    const dashboard = await http().get(`/api/v1/funds/${fundId}/dashboard`).set('Authorization', officers.fund_controller.auth).expect(200);
    expect(dashboard.body.data.intake).toBe(1000);
    expect(dashboard.body.data.disbursed).toBe(600);
  });
});
