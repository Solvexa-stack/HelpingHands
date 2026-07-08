import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PolicyDivergenceRecorder } from '../src/modules/policy/policy.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W1-E4-S2/S3/S4 — PolicyGuard shadow mode: never blocks, agrees with
 * RolesGuard across a representative sweep of every legacy role combination
 * (the S3 burn-down evidence), and audits sensitive financial/governance
 * decisions including denials.
 */
describe('Policy engine shadow mode (W1-E4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let recorder: PolicyDivergenceRecorder;
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let projectId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recorder = app.get(PolicyDivergenceRecorder);
    await resetDatabase(prisma);

    [admin, employee, officer, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'financial_officer'),
      authHeaderFor(prisma, 'participant'),
    ]);
    ({ projectId } = await createProjectViaApi(app, employee, 'policy-shadow'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('a representative sweep over every legacy role combination produces zero divergence (S3)', async () => {
    recorder.divergences.length = 0;
    const identities = [admin, employee, officer, participant];

    // Every distinct @Roles combination in the codebase is represented:
    const sweep: Array<[string, string, object?]> = [
      ['GET', '/api/v1/auth/me'],                                        // authed, no roles
      ['GET', '/api/v1/donations'],                                      // authed, no roles
      ['GET', '/api/v1/study'],                                          // admin+employee+officer
      ['GET', '/api/v1/admins'],                                         // admin only
      ['GET', '/api/v1/admins/financial-officers'],                      // admin+employee
      ['GET', '/api/v1/participants'],                                   // admin+employee
      ['GET', '/api/v1/payments/donations'],                             // admin+employee+participant
      ['GET', `/api/v1/projects/${projectId}/financial/summary`],        // staff trio
      ['GET', `/api/v1/projects/${projectId}/financial/transactions`],   // admin+officer
      ['GET', `/api/v1/projects/${projectId}/execution/phases`],         // admin+employee
      ['GET', `/api/v1/projects/${projectId}/milestones`],               // admin+employee
      ['GET', '/api/v1/organizations'],                                  // admin only (W1)
      ['POST', '/api/v1/projects', {}],                                  // admin+employee (400 past guards)
      ['POST', '/api/v1/blocks', {}],                                    // admin+employee
      ['POST', '/api/v1/donations', {}],                                 // participant only
      ['POST', '/api/v1/payments/checkout', {}],                         // participant only
      ['POST', '/api/v1/admins', {}],                                    // admin only
      ['POST', '/api/v1/languages', {}],                                 // admin only
      ['PATCH', '/api/v1/donations/999999/status', {}],                  // staff trio → donation.decide
      ['PATCH', `/api/v1/study/999999/status`, {}],                      // admin+employee
      ['POST', `/api/v1/projects/${projectId}/financial/budgets`, {}],   // admin+officer → budget.write
      ['POST', `/api/v1/projects/${projectId}/financial/expenses`, {}],  // admin+employee
      ['POST', `/api/v1/projects/${projectId}/financial/transactions`, {}], // admin+officer → transaction.write
      ['DELETE', '/api/v1/projects/999999'],                             // admin only
      ['PATCH', '/api/v1/participants/999999/toggle-active'],            // admin only
    ];

    for (const [method, path, body] of sweep) {
      for (const identity of identities) {
        let req = (http() as any)[method.toLowerCase()](path).set('Authorization', identity);
        if (body !== undefined) req = req.send(body);
        await req; // status irrelevant — RolesGuard still enforces
      }
    }

    expect(recorder.report()).toEqual({});
    expect(recorder.divergences).toHaveLength(0);
  });

  it('sensitive denial is audited with its reason (S4 AC)', async () => {
    // Employee may not decide expenses: legacy 403, policy deny — both audited
    await http()
      .patch(`/api/v1/projects/${projectId}/financial/expenses/999999/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(403);

    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({
        where: { action: 'policy.decided', subjectId: 'expense.decide' },
        orderBy: { id: 'desc' },
      });
      if (row) {
        expect(row.after).toMatchObject({
          action: 'expense.decide',
          allow: false,
          legacyAllowed: false,
          reason: 'denied:no-matching-grant',
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('sensitive denial never reached the audit trail');
  });

  it('sensitive allows are audited too (S4)', async () => {
    await http()
      .patch(`/api/v1/organizations/1/capabilities`)
      .set('Authorization', admin)
      .send({
        canExecuteProjects: true,
        canReceivePublicFunds: true,
        canOpenDonations: true,
        isGovernmentEntity: false,
        requiresBoardOversight: false,
      })
      .expect(200);

    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({
        where: { action: 'policy.decided', subjectId: 'organization.capability.set' },
      });
      if (row) {
        expect(row.after).toMatchObject({ allow: true, reason: expect.stringContaining('granted:board_chair@platform') });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('sensitive allow never reached the audit trail');
  });

  it('shadow mode never blocks: the guard sweep left the regression contract intact', async () => {
    // Legacy enforcement still the source of truth
    await http().get('/api/v1/admins').set('Authorization', employee).expect(403);
    await http().get('/api/v1/admins').set('Authorization', admin).expect(200);
  });
});
