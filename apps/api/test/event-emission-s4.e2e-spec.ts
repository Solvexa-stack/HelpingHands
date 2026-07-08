import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

/**
 * W0-E2-S4 — event emission for donations, payments, execution, financial
 * and milestones. One project walks the full post-approval path; every event
 * must appear exactly once, in order, with the right actor and requestId.
 * Webhook replays (already deduped at the payment level) must not re-emit.
 */
describe('Domain event emission: donations, payments, execution, financial, milestones (W0-E2-S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let captured: DomainEvent[];
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let employeeUserId: number;
  let officerUserId: number;
  let participantUserId: number;
  let participantId: number;

  let projectId: number;
  let phaseId: number;
  let taskId: number;

  const stripe = new StripeSDK('sk_test_e2e_signing_only');
  const http = () => request(app.getHttpServer());
  const names = () => captured.map((e) => e.event);
  const byName = (name: string) => captured.filter((e) => e.event === name);

  const postStripeWebhook = (payload: string, requestId?: string) => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    let req = http()
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json');
    if (requestId) req = req.set('x-request-id', requestId);
    return req.send(payload);
  };

  const stripeEvent = (type: string, sessionId: string) =>
    JSON.stringify({ id: `evt_s4_${type}_${sessionId}`, type, data: { object: { id: sessionId, payment_intent: 'pi_s4' } } });

  const seedOnlineDonation = (sessionId: string, amount: number) =>
    prisma.onlineDonation.create({
      data: {
        projectId,
        participantId,
        amount,
        currency: 'USD',
        provider: 'stripe',
        providerSessionId: sessionId,
        status: 'pending',
      },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    captured = [];
    app.get(EventEmitter2).on('**', (event: DomainEvent) => {
      // policy.decided is a shadow-mode decision record (W1-E4), not a domain mutation
      if (event && typeof event === 'object' && 'event' in event && event.event !== 'policy.decided') {
        captured.push(event);
      }
    });

    [admin, employee, officer, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'financial_officer'),
      authHeaderFor(prisma, 'participant'),
    ]);
    employeeUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.employee.email } }))!.id;
    officerUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.financial_officer.email } }))!.id;
    const participantUser = await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.participant.email } });
    participantUserId = participantUser!.id;
    participantId = participantUser!.referenceId;

    ({ projectId } = await createProjectViaApi(app, employee, 's4-events', { value: 10000 }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('donation.pledged / approved / rejected with the pledging participant and deciding employee as actors', async () => {
    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 4000 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(200);

    const rejected = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 1000 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${rejected.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'rejected', notes: 'unverifiable' })
      .expect(200);

    const pledgedEvents = byName('donation.pledged');
    expect(pledgedEvents).toHaveLength(2);
    expect(pledgedEvents[0].actor.userId).toBe(participantUserId);
    expect(pledgedEvents[0].actor.referenceType).toBe('participant');
    expect(pledgedEvents[0].data).toEqual({ projectId, amount: 4000 });

    const approvedEvents = byName('donation.approved');
    expect(approvedEvents).toHaveLength(1);
    expect(approvedEvents[0].actor.userId).toBe(employeeUserId);
    expect(approvedEvents[0].subject).toEqual({ type: 'donation', id: pledge.body.data.id });

    expect(byName('donation.rejected')).toHaveLength(1);
    // 40% — project not closed yet
    expect(byName('project.closed')).toHaveLength(0);
  });

  it('cancelling a pledge emits nothing (not part of the S4 catalog)', async () => {
    const before = captured.length;
    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 50 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/cancel`)
      .set('Authorization', participant)
      .expect(200);

    expect(captured.length).toBe(before + 1); // only donation.pledged
  });

  it('phase.created → phase.started → phase.completed', async () => {
    const blockId = await createBlockViaApi(app, employee, 's4-phase');
    const phase = await http()
      .post(`/api/v1/projects/${projectId}/execution/phases`)
      .set('Authorization', employee)
      .send({ blockId, order: 1 })
      .expect(201);
    phaseId = phase.body.data.id;

    await http()
      .patch(`/api/v1/projects/${projectId}/execution/phases/${phaseId}`)
      .set('Authorization', employee)
      .send({ status: 'in_progress' })
      .expect(200);
    await http()
      .patch(`/api/v1/projects/${projectId}/execution/phases/${phaseId}`)
      .set('Authorization', employee)
      .send({ status: 'completed' })
      .expect(200);

    expect(byName('phase.created')).toHaveLength(1);
    expect(byName('phase.created')[0].data).toEqual({ projectId, order: 1 });
    expect(byName('phase.started')).toHaveLength(1);
    expect(byName('phase.completed')).toHaveLength(1);
    expect(byName('phase.completed')[0].actor.userId).toBe(employeeUserId);
  });

  it('task.created → task.updated → task.completed', async () => {
    const blockId = await createBlockViaApi(app, employee, 's4-task');
    const task = await http()
      .post(`/api/v1/projects/${projectId}/execution/tasks`)
      .set('Authorization', employee)
      .send({ blockId, phaseId, assignedToId: 2 })
      .expect(201);
    taskId = task.body.data.id;

    await http()
      .patch(`/api/v1/projects/${projectId}/execution/tasks/${taskId}`)
      .set('Authorization', employee)
      .send({ status: 'in_progress' })
      .expect(200);
    await http()
      .patch(`/api/v1/projects/${projectId}/execution/tasks/${taskId}`)
      .set('Authorization', employee)
      .send({ status: 'completed' })
      .expect(200);

    expect(byName('task.created')).toHaveLength(1);
    expect(byName('task.created')[0].data).toEqual({ projectId, phaseId, assignedToId: 2 });
    expect(byName('task.updated')).toHaveLength(1);
    expect(byName('task.updated')[0].data).toEqual({ projectId, changedFields: ['status'] });
    expect(byName('task.completed')).toHaveLength(1);
  });

  it('expense.submitted → expense.approved / expense.rejected (budget creation stays silent)', async () => {
    const budgetBlock = await createBlockViaApi(app, employee, 's4-budget');
    const beforeBudget = captured.length;
    const budget = await http()
      .post(`/api/v1/projects/${projectId}/financial/budgets`)
      .set('Authorization', officer)
      .send({ blockId: budgetBlock, estimatedAmount: 3000 })
      .expect(201);
    expect(captured.length).toBe(beforeBudget); // budgets are not in the catalog

    const e1Block = await createBlockViaApi(app, employee, 's4-expense-1');
    const e1 = await http()
      .post(`/api/v1/projects/${projectId}/financial/expenses`)
      .set('Authorization', employee)
      .send({ blockId: e1Block, budgetId: budget.body.data.id, amount: 500 })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/financial/expenses/${e1.body.data.id}/status`)
      .set('Authorization', officer)
      .send({ status: 'approved' })
      .expect(200);

    const e2Block = await createBlockViaApi(app, employee, 's4-expense-2');
    const e2 = await http()
      .post(`/api/v1/projects/${projectId}/financial/expenses`)
      .set('Authorization', employee)
      .send({ blockId: e2Block, amount: 200 })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/financial/expenses/${e2.body.data.id}/status`)
      .set('Authorization', admin)
      .send({ status: 'rejected' })
      .expect(200);

    expect(byName('expense.submitted')).toHaveLength(2);
    expect(byName('expense.submitted')[0].data).toEqual({
      projectId,
      budgetId: budget.body.data.id,
      amount: 500,
    });

    const approved = byName('expense.approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].actor.userId).toBe(officerUserId);
    expect(approved[0].data).toEqual({ projectId, budgetId: budget.body.data.id, amount: 500 });

    expect(byName('expense.rejected')).toHaveLength(1);
    expect(byName('expense.rejected')[0].data).toEqual({ projectId, budgetId: null, amount: 200 });
  });

  it('milestone.created → milestone.completed / milestone.missed', async () => {
    const m1Block = await createBlockViaApi(app, employee, 's4-milestone-1');
    const m1 = await http()
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', employee)
      .send({ blockId: m1Block, targetDate: '2026-09-01T00:00:00.000Z' })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/milestones/${m1.body.data.id}`)
      .set('Authorization', employee)
      .send({ status: 'completed', completedAt: '2026-08-15T00:00:00.000Z' })
      .expect(200);

    const m2Block = await createBlockViaApi(app, employee, 's4-milestone-2');
    const m2 = await http()
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', employee)
      .send({ blockId: m2Block, targetDate: '2026-06-01T00:00:00.000Z' })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/milestones/${m2.body.data.id}`)
      .set('Authorization', employee)
      .send({ status: 'missed' })
      .expect(200);

    expect(byName('milestone.created')).toHaveLength(2);
    expect(byName('milestone.created')[0].data).toEqual({
      projectId,
      targetDate: '2026-09-01T00:00:00.000Z',
    });
    expect(byName('milestone.completed')).toHaveLength(1);
    expect(byName('milestone.missed')).toHaveLength(1);
  });

  it('payment.completed via signed webhook: anonymous actor carrying the webhook requestId; replay emits nothing', async () => {
    const donation = await seedOnlineDonation('cs_s4_ok', 2500);
    const payload = stripeEvent('checkout.session.completed', 'cs_s4_ok');

    await postStripeWebhook(payload, 'wh-trace-s4').expect(201);

    const completed = byName('payment.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].subject).toEqual({ type: 'online_donation', id: donation.id });
    expect(completed[0].actor.referenceType).toBe('anonymous');
    expect(completed[0].actor.userId).toBeNull();
    expect(completed[0].requestId).toBe('wh-trace-s4');
    expect(completed[0].data).toEqual({ projectId, provider: 'stripe', amount: 2500 });

    // Replay: payment already completed → deduped → no second event
    await postStripeWebhook(payload).expect(201);
    expect(byName('payment.completed')).toHaveLength(1);
  });

  it('payment.failed on session expiry, exactly once', async () => {
    await seedOnlineDonation('cs_s4_expired', 800);
    const payload = stripeEvent('checkout.session.expired', 'cs_s4_expired');

    await postStripeWebhook(payload).expect(201);
    await postStripeWebhook(payload).expect(201); // replay: no longer pending → silent

    const failed = byName('payment.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].data).toEqual({ projectId, provider: 'stripe', amount: 800 });
  });

  it('an online payment that reaches the goal also emits project.closed (S3 gap closed)', async () => {
    // 4,000 cash + 2,500 online so far; this completes 10,000
    await seedOnlineDonation('cs_s4_closer', 3500);
    await postStripeWebhook(stripeEvent('checkout.session.completed', 'cs_s4_closer')).expect(201);

    const closed = byName('project.closed');
    expect(closed).toHaveLength(1);
    expect(closed[0].actor.referenceType).toBe('anonymous'); // webhook-triggered
    expect(closed[0].data).toEqual({ value: 10000, collected: 10000, progression: 100 });
  });

  it('failed mutations emit nothing (double-decide, invalid signature)', async () => {
    const before = captured.length;

    const pledge = await prisma.projectDonation.findFirst({ where: { status: 'approved' } });
    await http()
      .patch(`/api/v1/donations/${pledge!.id}/status`)
      .set('Authorization', admin)
      .send({ status: 'rejected' })
      .expect(400);

    const res = await http()
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=1,v1=bad')
      .set('Content-Type', 'application/json')
      .send(stripeEvent('checkout.session.completed', 'cs_s4_ok'));
    expect(res.status).toBeGreaterThanOrEqual(400);

    expect(captured.length).toBe(before);
  });

  it('the run produced exactly the expected ordered sequence with envelope invariants', () => {
    expect(names()).toEqual([
      'project.created',
      'donation.pledged',
      'donation.approved',
      'donation.pledged',
      'donation.rejected',
      'donation.pledged', // cancelled pledge — cancel itself is silent
      'phase.created',
      'phase.started',
      'phase.completed',
      'task.created',
      'task.updated',
      'task.completed',
      'expense.submitted',
      'expense.approved',
      'expense.submitted',
      'expense.rejected',
      'milestone.created',
      'milestone.completed',
      'milestone.created',
      'milestone.missed',
      'payment.completed',
      'payment.failed',
      'payment.completed',
      'project.closed',
    ]);

    for (const event of captured) {
      expect(event.version).toBe(1);
      expect(event.requestId).toBeTruthy();
      expect(event.requestId).toBe(event.actor.requestId);
      expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    }
  });
});
