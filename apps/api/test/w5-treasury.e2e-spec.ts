import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TreasuryService } from '../src/modules/treasury/treasury.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

/**
 * W5-E2/E4/E5 — the treasury core: balanced idempotent postings, money-event
 * routing (QR approval, webhook completion, expense approval), the frozen
 * legacy journal with treasury-only dual-write, the reconciliation gate, and
 * ledger-backed financial reads equal to legacy reads.
 */
describe('Treasury & ledger (W5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let treasury: TreasuryService;
  let admin: string;
  let employee: string;
  let participant: string;
  let projectId: number;
  let actor: { userId: number; referenceType: string; requestId: string; ip: null };

  const stripe = new StripeSDK('sk_test_e2e_signing_only');
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    treasury = app.get(TreasuryService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';

    [admin, employee, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'participant'),
    ]);
    const adminUser = await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.administrator.email } });
    actor = { userId: adminUser!.id, referenceType: 'admin', requestId: 'w5-test', ip: null };

    ({ projectId } = await createProjectViaApi(app, employee, 'treasury', { value: 100000 }));
  }, 60_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  it('rejects unbalanced and non-positive postings', async () => {
    const cash = await treasury.platformAccount('cash');
    const project = await treasury.projectAccount(projectId);
    await expect(
      treasury.post(actor, {
        description: 'unbalanced',
        entries: [
          { accountId: cash.id, direction: 'debit', amount: 100 },
          { accountId: project.id, direction: 'credit', amount: 90 },
        ],
      }),
    ).rejects.toThrow(/Unbalanced/);
    await expect(
      treasury.post(actor, {
        description: 'one-legged',
        entries: [{ accountId: cash.id, direction: 'debit', amount: 100 }],
      }),
    ).rejects.toThrow(/at least two entries/);
  });

  it('posting is idempotent on (referenceType, referenceId, event)', async () => {
    const cash = await treasury.platformAccount('cash');
    const project = await treasury.projectAccount(projectId);
    const projectRow = await prisma.project.findUnique({ where: { id: projectId } });
    const input = {
      description: 'idempotency probe',
      referenceType: 'probe',
      referenceId: 42,
      event: 'probe.test',
      entries: [
        { accountId: cash.id, direction: 'debit' as const, amount: 50 },
        { accountId: project.id, direction: 'credit' as const, amount: 50 },
      ],
      // dual-write keeps the reconciliation invariant intact for this project
      legacyJournal: {
        projectBlockId: projectRow!.blockId,
        projectRefId: projectId,
        type: 'income' as const,
        notes: 'idempotency probe',
      },
    };
    const first = await treasury.post(actor, input);
    const second = await treasury.post(actor, input);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.transaction.id).toBe(first.transaction.id);
    const count = await prisma.ledgerTransaction.count({ where: { referenceType: 'probe' } });
    expect(count).toBe(1);
  });

  it('QR donation approval posts a balanced credit and dual-writes the legacy row', async () => {
    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 300 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(200);

    const posting = await prisma.ledgerTransaction.findUnique({
      where: {
        referenceType_referenceId_event: {
          referenceType: 'donation',
          referenceId: pledge.body.data.id,
          event: 'donation.approved',
        },
      },
      include: { entries: true },
    });
    expect(posting).not.toBeNull();
    expect(posting!.entries).toHaveLength(2);

    // legacy dual-write row: exact shape the old direct write produced
    const legacy = await prisma.projectTransaction.findFirst({
      where: { referenceType: 'donation', referenceId: pledge.body.data.id },
    });
    expect(legacy).not.toBeNull();
    expect(legacy!.type).toBe('income');
    expect(legacy!.projectRefId).toBe(projectId);
    expect(Number(legacy!.amount)).toBe(300);

    const account = await treasury.projectAccount(projectId);
    expect(await treasury.balance(account.id)).toBe(350); // 300 donation + 50 probe
  });

  it('webhook completion posts once, replays safely', async () => {
    const participantRow = await prisma.participant.findFirst({});
    await prisma.onlineDonation.create({
      data: { projectId, participantId: participantRow!.id, amount: 120, currency: 'USD', provider: 'stripe', providerSessionId: 'cs_w5_1', status: 'pending' },
    });
    const payload = JSON.stringify({ id: 'evt_w5', type: 'checkout.session.completed', data: { object: { id: 'cs_w5_1', payment_intent: 'pi_w5' } } });
    const signature = () => stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });

    await http().post('/api/v1/webhooks/stripe').set('stripe-signature', signature()).set('Content-Type', 'application/json').send(payload).expect(201);
    // replay: provider retries the same event
    await http().post('/api/v1/webhooks/stripe').set('stripe-signature', signature()).set('Content-Type', 'application/json').send(payload).expect(201);

    const postings = await prisma.ledgerTransaction.findMany({
      where: { referenceType: 'online_donation', event: 'payment.completed' },
    });
    expect(postings).toHaveLength(1);
    const stripeClearing = await treasury.platformAccount('stripe');
    expect(await treasury.balance(stripeClearing.id)).toBe(120);
  });

  it('expense approval posts a debit; statement and running balance are exact', async () => {
    const block = await http()
      .post('/api/v1/blocks')
      .set('Authorization', employee)
      .send({ category: 'project', translations: [{ languageCode: 'en', name: 'W5 expense', slug: 'w5-expense', brief: 'b', description: 'd' }] })
      .expect(201);
    const expense = await http()
      .post(`/api/v1/projects/${projectId}/financial/expenses`)
      .set('Authorization', employee)
      .send({ blockId: block.body.data.id, amount: 70 })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/financial/expenses/${expense.body.data.id}/status`)
      .set('Authorization', admin)
      .send({ status: 'approved' })
      .expect(200);

    const account = await treasury.projectAccount(projectId);
    const statement = await treasury.statement(account.id);
    // 50 (probe) + 300 (donation) + 120 (online) − 70 (expense) = 400
    expect(statement.balance).toBe(400);
    const last = statement.entries.at(-1)!;
    expect(last.direction).toBe('debit');
    expect(last.amount).toBe(70);
    expect(last.runningBalance).toBe(400);
  });

  it('the legacy journal is frozen: direct writes throw, treasury dual-write passes', async () => {
    await expect(
      prisma.projectTransaction.create({
        data: { projectId: 1, projectRefId: projectId, type: 'income', amount: 1 },
      }),
    ).rejects.toThrow(/frozen/);

    // manual entries post through treasury (endpoint contract preserved)
    const res = await http()
      .post(`/api/v1/projects/${projectId}/financial/transactions`)
      .set('Authorization', admin)
      .send({ type: 'adjustment', amount: 10, notes: 'w5 manual adjustment' })
      .expect(201);
    expect(res.body.data.type).toBe('adjustment');
  });

  it('reconciliation is exact for every project (the E4 gate)', async () => {
    const res = await http().get('/api/v1/treasury/reconciliation').set('Authorization', admin).expect(200);
    expect(res.body.data.every((r: any) => r.equal)).toBe(true);
    const ours = res.body.data.find((r: any) => r.projectId === projectId);
    expect(ours.legacyNet).toBe(410); // 50 probe + 300 donation + 120 online + 10 adjustment − 70 expense
    expect(ours.ledgerBalance).toBe(410);
  });

  it('ledger-backed financial reads equal legacy reads (E8-S1 cutover parity)', async () => {
    const legacyRows = await http().get(`/api/v1/projects/${projectId}/financial/transactions`).set('Authorization', admin).expect(200);
    process.env.TREASURY_LEDGER_READS = 'true';
    try {
      const ledgerRows = await http().get(`/api/v1/projects/${projectId}/financial/transactions`).set('Authorization', admin).expect(200);
      const net = (rows: any[]) =>
        rows.reduce((s, r) => s + (['income', 'adjustment'].includes(r.type) ? Number(r.amount) : -Number(r.amount)), 0);
      // dual-write keeps both representations at the same net
      expect(net(ledgerRows.body.data)).toBe(net(legacyRows.body.data));
      for (const row of ledgerRows.body.data) {
        expect(row).toMatchObject({ projectRefId: projectId });
        expect(['income', 'expense', 'adjustment', 'refund']).toContain(row.type);
      }
    } finally {
      process.env.TREASURY_LEDGER_READS = 'false';
    }
  });
});
