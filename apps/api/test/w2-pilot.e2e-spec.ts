import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

/**
 * W2-E6-S1/S2 — pilot organization: manual onboarding (create org → invite
 * first org_admin → invitee activates via the reset flow), then one project
 * runs study→voting→approval→donation (QR + online webhook)→execution→closure
 * entirely inside its workspace, with TENANCY_ENFORCED and POLICY_ENFORCED on.
 */
describe('Pilot org full lifecycle (W2-E6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformAdmin: string;
  let org1Employee: string;
  let participant: string;
  let pilotAdmin: string;
  let pilotOrgId: number;
  let pilotUserId: number;
  let projectId: number;
  let studyId: number;

  const stripe = new StripeSDK('sk_test_e2e_signing_only');
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    [platformAdmin, org1Employee, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'participant'),
    ]);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
  });

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  it('onboards the pilot org and its first admin through the invite flow (E6-S1)', async () => {
    const org = await http()
      .post('/api/v1/organizations')
      .set('Authorization', platformAdmin)
      .send({ type: 'ngo', name: 'Pilot Youth NGO', registrationNumber: 'PILOT-1' })
      .expect(201);
    pilotOrgId = org.body.data.id;
    await http()
      .patch(`/api/v1/organizations/${pilotOrgId}/capabilities`)
      .set('Authorization', platformAdmin)
      .send({ canExecuteProjects: true, canReceivePublicFunds: false, canOpenDonations: true, isGovernmentEntity: false, requiresBoardOversight: false })
      .expect(200);

    const invite = await http()
      .post(`/api/v1/organizations/${pilotOrgId}/invite-admin`)
      .set('Authorization', platformAdmin)
      .send({ email: 'pilot.admin@example.com', firstName: 'Pilot', lastName: 'Admin' })
      .expect(201);
    pilotUserId = invite.body.data.userId;

    // invitee activates via the reset flow and logs in
    const reset = await prisma.passwordResetToken.findFirst({ where: { email: 'pilot.admin@example.com' } });
    await http().post('/api/v1/auth/reset-password').send({ token: reset!.token, password: 'Pilot@12345' }).expect(200);
    const login = await http().post('/api/v1/auth/login').send({ email: 'pilot.admin@example.com', password: 'Pilot@12345' }).expect(200);
    pilotAdmin = `Bearer ${login.body.data.accessToken}`;
    expect(login.body.data.user.referenceType).toBe('admin');

    const payload = JSON.parse(Buffer.from(login.body.data.accessToken.split('.')[1], 'base64').toString());
    expect(payload.activeOrgId).toBe(pilotOrgId); // sole membership auto-context
  });

  it('the pilot admin creates a project inside their workspace', async () => {
    const block = await http()
      .post('/api/v1/blocks')
      .set('Authorization', pilotAdmin)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: 'Pilot well', slug: 'pilot-well', brief: 'b', description: 'd' }],
      })
      .expect(201);
    const project = await http()
      .post('/api/v1/projects')
      .set('Authorization', pilotAdmin)
      .send({ blockId: block.body.data.id, value: 1000, category: 'agricultural' })
      .expect(201);
    projectId = project.body.data.id;

    // W2 finding: platform creates still assign the default org — reassign to
    // the pilot (org-scoped creation is a filed follow-up story).
    await prisma.project.update({ where: { id: projectId }, data: { ownerOrganizationId: pilotOrgId } });

    const visible = await http().get(`/api/v1/projects/${projectId}`).set('Authorization', pilotAdmin).expect(200);
    expect(visible.body.data.id).toBe(projectId);
  });

  it('study → sections → publish → vote → approve (governance transitions by the platform admin)', async () => {
    const study = await http().post('/api/v1/study').set('Authorization', pilotAdmin).send({ projectId }).expect(201);
    studyId = study.body.data.id;
    for (const section of study.body.data.sections) {
      await http().patch(`/api/v1/study/sections/${section.id}`).set('Authorization', platformAdmin).send({ status: 'completed' }).expect(200);
    }
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', platformAdmin).send({ status: 'published' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', platformAdmin).send({ status: 'voting_open' }).expect(200);
    await http().post('/api/v1/voting/cast').set('Authorization', participant).send({ studyId, choice: 'for' }).expect(201);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', platformAdmin).send({ status: 'voting_closed' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', platformAdmin).send({ status: 'approved' }).expect(200);
  });

  it('donations flow through both channels; execution runs; the project closes', async () => {
    // QR channel
    const pledge = await http().post('/api/v1/donations').set('Authorization', participant).send({ projectId, amount: 600 }).expect(201);
    await http().patch(`/api/v1/donations/${pledge.body.data.id}/status`).set('Authorization', pilotAdmin).send({ status: 'approved' }).expect(200);

    // online channel (signed webhook)
    const participantRow = await prisma.participant.findFirst({});
    await prisma.onlineDonation.create({
      data: { projectId, participantId: participantRow!.id, amount: 400, currency: 'USD', provider: 'stripe', providerSessionId: 'cs_pilot_1', status: 'pending' },
    });
    const payload = JSON.stringify({ id: 'evt_pilot', type: 'checkout.session.completed', data: { object: { id: 'cs_pilot_1', payment_intent: 'pi_pilot' } } });
    await http()
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET }))
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);

    // execution inside the workspace
    const phaseBlock = await http().post('/api/v1/blocks').set('Authorization', pilotAdmin).send({ category: 'project', translations: [{ languageCode: 'en', name: 'Pilot phase', slug: 'pilot-phase', brief: 'b', description: 'd' }] }).expect(201);
    const phase = await http().post(`/api/v1/projects/${projectId}/execution/phases`).set('Authorization', pilotAdmin).send({ blockId: phaseBlock.body.data.id }).expect(201);
    await http().patch(`/api/v1/projects/${projectId}/execution/phases/${phase.body.data.id}`).set('Authorization', pilotAdmin).send({ status: 'completed' }).expect(200);

    // closure: 600 QR + 400 online = 1,000 / 1,000
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(Number(project!.progression)).toBe(100);
    expect(project!.isCompleted).toBe(true);
  });

  it('the pilot workspace is invisible to the other org and visible to the Board', async () => {
    await http().get(`/api/v1/projects/${projectId}`).set('Authorization', org1Employee).expect(404);
    // With POLICY_ENFORCED on, the scope-chain denies cross-org subtree
    // access at the guard (403) before tenancy's 404 — an earlier denial.
    await http().get(`/api/v1/projects/${projectId}/milestones`).set('Authorization', org1Employee).expect(403);
    const org1List = await http().get('/api/v1/projects?limit=100').set('Authorization', org1Employee).expect(200);
    expect(org1List.body.data.data.map((p: any) => p.id)).not.toContain(projectId);

    await http().get(`/api/v1/projects/${projectId}`).set('Authorization', platformAdmin).expect(200);
  });
});
