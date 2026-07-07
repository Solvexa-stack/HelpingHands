import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PayPalService } from '../src/modules/payments/paypal.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { authHeaderFor } from './utils/auth';
import { createProjectViaApi } from './utils/fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

/**
 * W0-E1-S3 — Donation flows spec (QR physical + online webhook).
 *
 * Physical channel: participant pledges (ProjectDonation with qrToken) →
 * employee QR verify + approve → progression recalculated.
 * Online channel: OnlineDonation completed via simulated Stripe/PayPal
 * webhook payloads through the WebhookLog path, incl. replay dedupe.
 *
 * Stripe events are genuinely signed (HMAC over the raw body) with the test
 * webhook secret from test-env.ts — the real verification code runs. PayPal
 * verification requires calling PayPal's API, so only verifyWebhook is
 * stubbed; everything downstream runs for real.
 */
describe('Donation flows: QR physical + online webhooks (W0-E1-S3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let employeeAdminId: number;
  let participantId: number;
  let paypalVerifySpy: jest.SpyInstance;

  const stripe = new StripeSDK('sk_test_e2e_signing_only');

  const http = () => request(app.getHttpServer());

  const signStripePayload = (payload: string) =>
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });

  const postStripeWebhook = (payload: string, signature?: string) =>
    http()
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', signature ?? signStripePayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);

  const stripeEvent = (type: string, sessionId: string, paymentIntent?: string) =>
    JSON.stringify({
      id: `evt_e2e_${type}_${sessionId}`,
      type,
      data: { object: { id: sessionId, payment_intent: paymentIntent ?? null } },
    });

  const paypalEvent = (eventType: string, orderId: string, captureId: string) => ({
    id: `WH-e2e-${orderId}`,
    event_type: eventType,
    resource: {
      id: captureId,
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  });

  const expectProgress = async (projectId: number, progression: number, isCompleted: boolean) => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(Number(project!.progression)).toBe(progression);
    expect(project!.isCompleted).toBe(isCompleted);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    [admin, employee, officer, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'financial_officer'),
      authHeaderFor(prisma, 'participant'),
    ]);

    const employeeUser = await prisma.user.findUnique({
      where: { email: 'employee@helpinghands.org' },
    });
    const participantUser = await prisma.user.findUnique({
      where: { email: 'participant@example.com' },
    });
    employeeAdminId = employeeUser!.referenceId;
    participantId = participantUser!.referenceId;

    // PayPal signature verification calls PayPal's API over the network —
    // stub only that; the webhook processing pipeline runs for real.
    paypalVerifySpy = jest
      .spyOn(app.get(PayPalService), 'verifyWebhook')
      .mockResolvedValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Physical channel: QR pledge → verify → approve ──────────────────────────

  describe('QR physical donations', () => {
    let projectId: number;
    let pledge: any; // 20,000 — approved
    let rejectedPledge: any; // 5,000 — rejected
    let cancelledPledge: any; // 1,000 — cancelled

    it('employee creates a project (value 50,000)', async () => {
      ({ projectId } = await createProjectViaApi(app, employee, 'qr-donations', { value: 50000 }));
      await expectProgress(projectId, 0, false);
    });

    it('participant pledges and receives a 32-char QR token + QR image', async () => {
      const res = await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 20000 })
        .expect(201);

      pledge = res.body.data;
      expect(pledge.status).toBe('pending');
      expect(pledge.qrToken).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(pledge.qrDataUrl).toMatch(/^data:image\/png/);
    });

    it('staff cannot pledge (participant-only endpoint)', async () => {
      await http()
        .post('/api/v1/donations')
        .set('Authorization', employee)
        .send({ projectId, amount: 100 })
        .expect(403);
    });

    it('the QR token resolves the pledge publicly (employee scan flow)', async () => {
      const res = await http().get(`/api/v1/donations/token/${pledge.qrToken}`).expect(200);
      expect(res.body.data.id).toBe(pledge.id);
      expect(Number(res.body.data.amount)).toBe(20000);

      await http().get('/api/v1/donations/token/nonexistent-token-000000000000').expect(404);
    });

    it('QR code endpoints serve the token as data URL and PNG download', async () => {
      const res = await http().get(`/api/v1/donations/${pledge.qrToken}/qr`).expect(200);
      expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png/);

      const png = await http().get(`/api/v1/donations/${pledge.qrToken}/qr/download`).expect(200);
      expect(png.headers['content-type']).toBe('image/png');
    });

    it('participants cannot approve donations', async () => {
      await http()
        .patch(`/api/v1/donations/${pledge.id}/status`)
        .set('Authorization', participant)
        .send({ status: 'approved' })
        .expect(403);
    });

    it('a financial officer not assigned to the project cannot approve', async () => {
      await http()
        .patch(`/api/v1/donations/${pledge.id}/status`)
        .set('Authorization', officer)
        .send({ status: 'approved' })
        .expect(403);
    });

    it('employee approves the pledge → progression recalculated to 40%', async () => {
      const res = await http()
        .patch(`/api/v1/donations/${pledge.id}/status`)
        .set('Authorization', employee)
        .send({ status: 'approved', notes: 'Cash received and verified' })
        .expect(200);

      expect(res.body.data.status).toBe('approved');
      expect(res.body.data.approvedBy).toBe(employeeAdminId);
      expect(res.body.data.approvedAt).toBeTruthy();

      await expectProgress(projectId, 40, false); // 20,000 / 50,000
    });

    it('a rejected pledge does not count towards progression', async () => {
      const created = await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 5000 })
        .expect(201);
      rejectedPledge = created.body.data;

      const res = await http()
        .patch(`/api/v1/donations/${rejectedPledge.id}/status`)
        .set('Authorization', employee)
        .send({ status: 'rejected', notes: 'Amount could not be verified' })
        .expect(200);

      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.notes).toBe('Amount could not be verified');
      await expectProgress(projectId, 40, false);
    });

    it('participant can cancel their own pending pledge; cancelled pledges are immutable', async () => {
      const created = await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 1000 })
        .expect(201);
      cancelledPledge = created.body.data;

      const res = await http()
        .patch(`/api/v1/donations/${cancelledPledge.id}/cancel`)
        .set('Authorization', participant)
        .expect(200);
      expect(res.body.data.status).toBe('cancelled');

      await http()
        .patch(`/api/v1/donations/${cancelledPledge.id}/status`)
        .set('Authorization', employee)
        .send({ status: 'approved' })
        .expect(400);
      await expectProgress(projectId, 40, false);
    });

    it('a second approval reaches 100% and completes the project', async () => {
      const created = await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 30000 })
        .expect(201);

      await http()
        .patch(`/api/v1/donations/${created.body.data.id}/status`)
        .set('Authorization', employee)
        .send({ status: 'approved' })
        .expect(200);

      await expectProgress(projectId, 100, true); // 50,000 / 50,000
    });

    it('completed projects stop accepting pledges', async () => {
      await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 100 })
        .expect(400);
    });

    it('approved donations cannot be modified', async () => {
      await http()
        .patch(`/api/v1/donations/${pledge.id}/status`)
        .set('Authorization', admin)
        .send({ status: 'rejected' })
        .expect(400);
    });
  });

  // ─── Online channel: provider webhooks through the WebhookLog path ───────────

  describe('online donations via provider webhooks', () => {
    let projectId: number;

    const seedOnlineDonation = (
      provider: 'stripe' | 'paypal',
      providerSessionId: string,
      amount: number,
    ) =>
      prisma.onlineDonation.create({
        data: {
          projectId,
          participantId,
          amount,
          currency: 'USD',
          provider,
          providerSessionId,
          status: 'pending',
        },
      });

    it('employee creates a project (value 10,000)', async () => {
      ({ projectId } = await createProjectViaApi(app, employee, 'online-donations', {
        value: 10000,
      }));
    });

    it('checkout is refused while the project has no approved study', async () => {
      await http()
        .post('/api/v1/payments/checkout')
        .set('Authorization', participant)
        .send({ projectId, amount: 25, provider: 'stripe' })
        .expect(403);
    });

    it('a signed Stripe checkout.session.completed webhook completes the donation (25%)', async () => {
      const donation = await seedOnlineDonation('stripe', 'cs_e2e_stripe_1', 2500);
      const payload = stripeEvent('checkout.session.completed', 'cs_e2e_stripe_1', 'pi_e2e_1');

      const res = await postStripeWebhook(payload).expect(201);
      expect(res.body.data.received).toBe(true);

      const updated = await prisma.onlineDonation.findUnique({ where: { id: donation.id } });
      expect(updated!.status).toBe('completed');
      expect(updated!.providerPaymentId).toBe('pi_e2e_1');
      expect(updated!.paidAt).toBeTruthy();
      await expectProgress(projectId, 25, false); // 2,500 / 10,000

      const log = await prisma.webhookLog.findFirst({
        where: { provider: 'stripe', eventType: 'checkout.session.completed' },
        orderBy: { id: 'desc' },
      });
      expect(log).toBeTruthy();
      expect(log!.error).toBeNull();
      // Current behavior (BUG-3, backlog/BACKLOG_BUGS.md): markWebhookProcessed's
      // Json shorthand filter throws and is swallowed, so processedAt is never
      // set. Flip this to toBeTruthy() when BUG-3 is fixed.
      expect(log!.processedAt).toBeNull();
    });

    it('a replayed Stripe event is deduplicated — no double-count', async () => {
      const before = await prisma.onlineDonation.findUnique({
        where: { providerSessionId: 'cs_e2e_stripe_1' },
      });

      const payload = stripeEvent('checkout.session.completed', 'cs_e2e_stripe_1', 'pi_e2e_1');
      await postStripeWebhook(payload).expect(201);

      const after = await prisma.onlineDonation.findUnique({
        where: { providerSessionId: 'cs_e2e_stripe_1' },
      });
      expect(after!.paidAt!.toISOString()).toBe(before!.paidAt!.toISOString());
      await expectProgress(projectId, 25, false);

      // Both deliveries are recorded in the webhook log
      const logs = await prisma.webhookLog.count({
        where: { provider: 'stripe', eventType: 'checkout.session.completed' },
      });
      expect(logs).toBe(2);
    });

    it('a Stripe event with an invalid signature is refused and logged with an error', async () => {
      const payload = stripeEvent('checkout.session.completed', 'cs_e2e_stripe_1', 'pi_e2e_1');
      const res = await postStripeWebhook(payload, 't=1,v1=invalid');
      expect(res.status).toBeGreaterThanOrEqual(400);

      const log = await prisma.webhookLog.findFirst({
        where: { provider: 'stripe', eventType: 'unknown' },
      });
      expect(log!.error).toBeTruthy();
      expect(log!.processedAt).toBeNull();
      await expectProgress(projectId, 25, false);
    });

    it('checkout.session.expired marks the pending donation failed without affecting progression', async () => {
      const donation = await seedOnlineDonation('stripe', 'cs_e2e_stripe_2', 1000);
      const payload = stripeEvent('checkout.session.expired', 'cs_e2e_stripe_2');

      await postStripeWebhook(payload).expect(201);

      const updated = await prisma.onlineDonation.findUnique({ where: { id: donation.id } });
      expect(updated!.status).toBe('failed');
      await expectProgress(projectId, 25, false);
    });

    it('a PayPal PAYMENT.CAPTURE.COMPLETED webhook completes the order donation (50%)', async () => {
      const donation = await seedOnlineDonation('paypal', 'E2E-PAYPAL-ORDER-1', 2500);

      const res = await http()
        .post('/api/v1/webhooks/paypal')
        .send(paypalEvent('PAYMENT.CAPTURE.COMPLETED', 'E2E-PAYPAL-ORDER-1', 'CAPTURE-E2E-1'))
        .expect(201);
      expect(res.body.data.received).toBe(true);

      const updated = await prisma.onlineDonation.findUnique({ where: { id: donation.id } });
      expect(updated!.status).toBe('completed');
      expect(updated!.providerPaymentId).toBe('CAPTURE-E2E-1');
      await expectProgress(projectId, 50, false); // (2,500 + 2,500) / 10,000

      const log = await prisma.webhookLog.findFirst({
        where: { provider: 'paypal', eventType: 'PAYMENT.CAPTURE.COMPLETED' },
      });
      expect(log).toBeTruthy();
      // Current behavior (BUG-3): processedAt is never set — see stripe test above.
      expect(log!.processedAt).toBeNull();
    });

    it('a replayed PayPal event is deduplicated — no double-count', async () => {
      await http()
        .post('/api/v1/webhooks/paypal')
        .send(paypalEvent('PAYMENT.CAPTURE.COMPLETED', 'E2E-PAYPAL-ORDER-1', 'CAPTURE-E2E-1'))
        .expect(201);

      await expectProgress(projectId, 50, false);
    });

    it('a PayPal webhook failing verification is refused (403) and logged with an error', async () => {
      paypalVerifySpy.mockResolvedValueOnce(false);

      await http()
        .post('/api/v1/webhooks/paypal')
        .send(paypalEvent('PAYMENT.CAPTURE.COMPLETED', 'E2E-PAYPAL-ORDER-1', 'CAPTURE-E2E-1'))
        .expect(403);

      const log = await prisma.webhookLog.findFirst({
        where: { provider: 'paypal', eventType: 'unknown' },
      });
      expect(log!.error).toContain('PayPal webhook signature invalid');
      await expectProgress(projectId, 50, false);
    });

    it('QR and online donations combine in the progression math (100%)', async () => {
      const created = await http()
        .post('/api/v1/donations')
        .set('Authorization', participant)
        .send({ projectId, amount: 5000 })
        .expect(201);

      await http()
        .patch(`/api/v1/donations/${created.body.data.id}/status`)
        .set('Authorization', employee)
        .send({ status: 'approved' })
        .expect(200);

      // 5,000 cash + 5,000 online = 10,000 / 10,000
      await expectProgress(projectId, 100, true);
    });
  });
});
