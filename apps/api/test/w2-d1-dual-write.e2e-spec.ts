import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FkConsistencyService } from '../src/modules/projects/fk-consistency.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

/**
 * W2-E1-S2/S3 — every created execution/financial/milestone row carries a
 * matching legacy Block-FK + new Project-FK pair; the nightly consistency
 * job is green and alerts on injected drift.
 */
describe('D1 dual-write & FK consistency (W2-E1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let job: FkConsistencyService;
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let projectId: number;
  let blockId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    job = app.get(FkConsistencyService);
    await resetDatabase(prisma);

    [admin, employee, officer, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'financial_officer'),
      authHeaderFor(prisma, 'participant'),
    ]);
    ({ projectId, blockId } = await createProjectViaApi(app, employee, 'w2-d1', { value: 10000 }));

    // BUG-5 fix (backlog/BACKLOG_BUGS.md): financial endpoints now enforce
    // the financial-officer project-assignment check donations.service.ts
    // already applied. Assign the seeded officer used throughout this suite.
    const officerUser = await prisma.user.findUnique({ where: { email: 'officer@helpinghands.org' } });
    await prisma.project.update({ where: { id: projectId }, data: { financialOfficerId: officerUser!.referenceId } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('created rows carry matching FK pairs on all seven tables', async () => {
    const entityBlock = async (slug: string) => createBlockViaApi(app, employee, slug);

    const phase = (await http().post(`/api/v1/projects/${projectId}/execution/phases`).set('Authorization', employee).send({ blockId: await entityBlock('w2-phase') }).expect(201)).body.data;
    const task = (await http().post(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).send({ blockId: await entityBlock('w2-task') }).expect(201)).body.data;
    const step = (await http().post(`/api/v1/projects/${projectId}/execution/steps`).set('Authorization', employee).send({ blockId: await entityBlock('w2-step') }).expect(201)).body.data;
    const budget = (await http().post(`/api/v1/projects/${projectId}/financial/budgets`).set('Authorization', officer).send({ blockId: await entityBlock('w2-budget'), estimatedAmount: 100 }).expect(201)).body.data;
    const expense = (await http().post(`/api/v1/projects/${projectId}/financial/expenses`).set('Authorization', employee).send({ blockId: await entityBlock('w2-expense'), amount: 10 }).expect(201)).body.data;
    const milestone = (await http().post(`/api/v1/projects/${projectId}/milestones`).set('Authorization', employee).send({ blockId: await entityBlock('w2-milestone') }).expect(201)).body.data;
    const manualTx = (await http().post(`/api/v1/projects/${projectId}/financial/transactions`).set('Authorization', officer).send({ type: 'adjustment', amount: 5 }).expect(201)).body.data;
    // expense-approval ledger row
    await http().patch(`/api/v1/projects/${projectId}/financial/expenses/${expense.id}/status`).set('Authorization', officer).send({ status: 'approved' }).expect(200);
    // donation income ledger row (fire-and-forget in the service — poll below)
    const pledge = (await http().post('/api/v1/donations').set('Authorization', participant).send({ projectId, amount: 100 }).expect(201)).body.data;
    await http().patch(`/api/v1/donations/${pledge.id}/status`).set('Authorization', employee).send({ status: 'approved' }).expect(200);

    const pairs: Array<[string, number]> = [
      ['projectPhase', phase.id],
      ['projectTask', task.id],
      ['projectStep', step.id],
      ['projectBudget', budget.id],
      ['projectExpense', expense.id],
      ['projectMilestone', milestone.id],
      ['projectTransaction', manualTx.id],
    ];
    for (const [model, id] of pairs) {
      const row = await (prisma as any)[model].findFirst({ where: { id } });
      expect(row.projectId).toBe(blockId); // legacy generation intact
      expect(row.projectRefId).toBe(projectId); // new generation written
    }

    // ledger rows from expense approval + donation income both carry pairs
    for (let i = 0; i < 30; i++) {
      const income = await prisma.projectTransaction.findFirst({ where: { type: 'income' } });
      if (income) {
        expect(income.projectRefId).toBe(projectId);
        const expenseTx = await prisma.projectTransaction.findFirst({ where: { type: 'expense' } });
        expect(expenseTx!.projectRefId).toBe(projectId);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('income ledger row never appeared');
  });

  it('the nightly FK-pair job is green (S3)', async () => {
    expect(await job.check()).toEqual({});
    expect(await job.nightlyCheck()).toEqual({});
  });

  it('injected drift trips the alert into the audit trail (S3 AC)', async () => {
    const task = await prisma.projectTask.findFirst({});
    await prisma.projectTask.update({ where: { id: task!.id }, data: { projectRefId: null } });

    const mismatches = await job.nightlyCheck();
    expect(mismatches).toEqual({ project_tasks: 1 });

    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({ where: { action: 'fk_parity.drifted' } });
      if (row) {
        expect(row.after).toMatchObject({ mismatches: { project_tasks: 1 } });
        // restore
        await prisma.projectTask.update({ where: { id: task!.id }, data: { projectRefId: projectId } });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('fk_parity.drifted never reached the audit log');
  });
});
