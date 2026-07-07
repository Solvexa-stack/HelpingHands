import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { authHeaderFor } from './utils/auth';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

/**
 * W0-E1-S4 — Execution & financial spec.
 *
 * Freezes the post-approval execution path: phases → tasks (assignment,
 * status flow), steps hierarchy, milestones, budget → expense approval,
 * ProjectTransaction ledger rows, progress recalculation and project
 * closure (isCompleted).
 *
 * D1 note (see PROGRESS.md debt scoreboard): execution/financial tables FK
 * to Block, not Project — their `projectId` column stores the project's
 * blockId. The API translates transparently; one test pins that storage
 * reality so the Wave 2 migration has an explicit contract to change.
 */
describe('Execution & financial lifecycle (W0-E1-S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let employeeAdminId: number;

  let projectId: number;
  let projectBlockId: number;

  const http = () => request(app.getHttpServer());
  const base = () => `/api/v1/projects/${projectId}`;

  const newBlock = (slug: string) => createBlockViaApi(app, employee, slug);

  const pledgeAndApprove = async (amount: number) => {
    const created = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${created.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(200);
    return created.body.data.id as number;
  };

  const expectProgress = async (progression: number, isCompleted: boolean) => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(Number(project!.progression)).toBe(progression);
    expect(project!.isCompleted).toBe(isCompleted);
  };

  /** The donation income ledger write is fire-and-forget — poll for it. */
  const waitForIncomeTransaction = async (amount: number) => {
    for (let i = 0; i < 30; i++) {
      const tx = await prisma.projectTransaction.findFirst({
        where: { projectId: projectBlockId, type: 'income', amount },
      });
      if (tx) return tx;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`income transaction of ${amount} never appeared in the ledger`);
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
    employeeAdminId = employeeUser!.referenceId;

    ({ projectId, blockId: projectBlockId } = await createProjectViaApi(
      app,
      employee,
      'execution',
      { value: 10000 },
    ));
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Funding feeds the ledger ─────────────────────────────────────────────────

  describe('funding and the transaction ledger', () => {
    it('an approved donation recalculates progression (40%) and writes an income ledger row', async () => {
      await pledgeAndApprove(4000);
      await expectProgress(40, false); // 4,000 / 10,000

      const tx = await waitForIncomeTransaction(4000);
      expect(tx.referenceType).toBe('donation');
    });

    it('D1 reality: ledger rows are keyed by the project block id, not the project id', async () => {
      expect(projectBlockId).not.toBe(projectId); // meaningful only if they differ
      const tx = await prisma.projectTransaction.findFirst({ where: { type: 'income' } });
      expect(tx!.projectId).toBe(projectBlockId);
    });
  });

  // ─── Role matrix for execution & financial endpoints ─────────────────────────

  describe('role restrictions', () => {
    it('execution and milestones are admin/employee-only', async () => {
      await http().get(`${base()}/execution/phases`).set('Authorization', officer).expect(403);
      await http().get(`${base()}/execution/phases`).set('Authorization', participant).expect(403);
      await http().get(`${base()}/milestones`).set('Authorization', officer).expect(403);
      await http().get(`${base()}/milestones`).set('Authorization', participant).expect(403);
    });

    it('budgets are created by administrators/financial officers, not employees', async () => {
      await http()
        .post(`${base()}/financial/budgets`)
        .set('Authorization', employee)
        .send({ blockId: 1, estimatedAmount: 1 })
        .expect(403);
    });

    it('expenses are created by administrators/employees, not financial officers', async () => {
      await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', officer)
        .send({ blockId: 1, amount: 1 })
        .expect(403);
    });

    it('expense approval is for administrators/financial officers, not employees', async () => {
      await http()
        .patch(`${base()}/financial/expenses/999/status`)
        .set('Authorization', employee)
        .send({ status: 'approved' })
        .expect(403);
    });

    it('the transaction ledger is admin/financial-officer-only', async () => {
      await http().get(`${base()}/financial/transactions`).set('Authorization', employee).expect(403);
      await http().get(`${base()}/financial/transactions`).set('Authorization', participant).expect(403);
    });
  });

  // ─── Phases → tasks ───────────────────────────────────────────────────────────

  describe('phases and tasks', () => {
    let phaseId: number;
    let taskId: number;

    it('employee creates a phase (default status pending)', async () => {
      const blockId = await newBlock('phase-1');
      const res = await http()
        .post(`${base()}/execution/phases`)
        .set('Authorization', employee)
        .send({ blockId, order: 1 })
        .expect(201);

      phaseId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.order).toBe(1);
    });

    it('employee creates a task in the phase, assigned to an admin', async () => {
      const blockId = await newBlock('task-1');
      const res = await http()
        .post(`${base()}/execution/tasks`)
        .set('Authorization', employee)
        .send({ blockId, phaseId, assignedToId: employeeAdminId })
        .expect(201);

      taskId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.assignedTo.id).toBe(employeeAdminId);
    });

    it('a task cannot join a phase belonging to another project', async () => {
      const other = await createProjectViaApi(app, employee, 'execution-other');
      const blockId = await newBlock('task-foreign');
      await http()
        .post(`/api/v1/projects/${other.projectId}/execution/tasks`)
        .set('Authorization', employee)
        .send({ blockId, phaseId })
        .expect(404);
    });

    it('task walks the status flow: assigned → in_progress → completed', async () => {
      for (const status of ['assigned', 'in_progress', 'completed']) {
        const res = await http()
          .patch(`${base()}/execution/tasks/${taskId}`)
          .set('Authorization', employee)
          .send({ status })
          .expect(200);
        expect(res.body.data.status).toBe(status);
      }
    });

    it('no state machine guards tasks: pending → completed jump is allowed (current behavior)', async () => {
      const blockId = await newBlock('task-2');
      const created = await http()
        .post(`${base()}/execution/tasks`)
        .set('Authorization', employee)
        .send({ blockId, phaseId })
        .expect(201);

      const res = await http()
        .patch(`${base()}/execution/tasks/${created.body.data.id}`)
        .set('Authorization', employee)
        .send({ status: 'completed' })
        .expect(200);
      expect(res.body.data.status).toBe('completed');
    });

    it('tasks can be filtered by phase; a task is not reachable through the wrong project', async () => {
      const res = await http()
        .get(`${base()}/execution/tasks?phaseId=${phaseId}`)
        .set('Authorization', employee)
        .expect(200);
      expect(res.body.data).toHaveLength(2);

      const other = await prisma.project.findFirst({ where: { id: { not: projectId } } });
      await http()
        .patch(`/api/v1/projects/${other!.id}/execution/tasks/${taskId}`)
        .set('Authorization', employee)
        .send({ status: 'pending' })
        .expect(404);
    });

    it('phase completes', async () => {
      const res = await http()
        .patch(`${base()}/execution/phases/${phaseId}`)
        .set('Authorization', employee)
        .send({ status: 'completed' })
        .expect(200);
      expect(res.body.data.status).toBe('completed');
    });
  });

  // ─── Steps hierarchy ──────────────────────────────────────────────────────────

  describe('steps hierarchy', () => {
    let parentStepId: number;

    it('employee creates a parent step and a child step', async () => {
      const parentBlock = await newBlock('step-parent');
      const parent = await http()
        .post(`${base()}/execution/steps`)
        .set('Authorization', employee)
        .send({ blockId: parentBlock, priority: 1 })
        .expect(201);
      parentStepId = parent.body.data.id;

      const childBlock = await newBlock('step-child');
      await http()
        .post(`${base()}/execution/steps`)
        .set('Authorization', employee)
        .send({ blockId: childBlock, parentId: parentStepId, priority: 1 })
        .expect(201);

      const list = await http()
        .get(`${base()}/execution/steps`)
        .set('Authorization', employee)
        .expect(200);
      expect(list.body.data).toHaveLength(1); // only roots at top level
      expect(list.body.data[0].children).toHaveLength(1);
    });

    it('step progress is bounded 0–100', async () => {
      const res = await http()
        .patch(`${base()}/execution/steps/${parentStepId}/progress`)
        .set('Authorization', employee)
        .send({ progress: 55 })
        .expect(200);
      expect(Number(res.body.data.progress)).toBe(55);

      await http()
        .patch(`${base()}/execution/steps/${parentStepId}/progress`)
        .set('Authorization', employee)
        .send({ progress: 101 })
        .expect(400);
    });
  });

  // ─── Milestones ───────────────────────────────────────────────────────────────

  describe('milestones', () => {
    let milestoneId: number;

    it('employee creates milestones with target dates', async () => {
      const blockA = await newBlock('milestone-a');
      const res = await http()
        .post(`${base()}/milestones`)
        .set('Authorization', employee)
        .send({ blockId: blockA, targetDate: '2026-08-01T00:00:00.000Z' })
        .expect(201);
      milestoneId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');

      const blockB = await newBlock('milestone-b');
      await http()
        .post(`${base()}/milestones`)
        .set('Authorization', employee)
        .send({ blockId: blockB, targetDate: '2026-07-15T00:00:00.000Z', status: 'in_progress' })
        .expect(201);
    });

    it('milestones list ordered by target date', async () => {
      const res = await http().get(`${base()}/milestones`).set('Authorization', employee).expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].block.translations[0].slug).toBe('e2e-milestone-b');
    });

    it('completing a milestone stores completedAt only when provided (current behavior)', async () => {
      const withoutDate = await http()
        .patch(`${base()}/milestones/${milestoneId}`)
        .set('Authorization', employee)
        .send({ status: 'completed' })
        .expect(200);
      expect(withoutDate.body.data.status).toBe('completed');
      expect(withoutDate.body.data.completedAt).toBeNull();

      const withDate = await http()
        .patch(`${base()}/milestones/${milestoneId}`)
        .set('Authorization', employee)
        .send({ completedAt: '2026-07-20T12:00:00.000Z' })
        .expect(200);
      expect(withDate.body.data.completedAt).toBe('2026-07-20T12:00:00.000Z');
    });

    it('a milestone can be marked missed', async () => {
      const blockId = await newBlock('milestone-missed');
      const created = await http()
        .post(`${base()}/milestones`)
        .set('Authorization', employee)
        .send({ blockId, targetDate: '2026-06-01T00:00:00.000Z' })
        .expect(201);

      const res = await http()
        .patch(`${base()}/milestones/${created.body.data.id}`)
        .set('Authorization', employee)
        .send({ status: 'missed' })
        .expect(200);
      expect(res.body.data.status).toBe('missed');
    });
  });

  // ─── Budget → expense approval → ledger ───────────────────────────────────────

  describe('budget, expenses and the ledger', () => {
    let budgetId: number;
    let approvedExpenseId: number;

    it('financial officer creates a budget (no project-assignment check — current behavior)', async () => {
      // NOTE: unlike donations approval, financial endpoints never check
      // Project.financialOfficerId (BUG-5 in backlog/BACKLOG_BUGS.md).
      const blockId = await newBlock('budget-1');
      const res = await http()
        .post(`${base()}/financial/budgets`)
        .set('Authorization', officer)
        .send({ blockId, estimatedAmount: 5000, approvedAmount: 4000 })
        .expect(201);

      budgetId = res.body.data.id;
      expect(Number(res.body.data.estimatedAmount)).toBe(5000);
      expect(Number(res.body.data.approvedAmount)).toBe(4000);
      expect(Number(res.body.data.actualAmount)).toBe(0);
    });

    it('employee submits an expense against the budget (pending)', async () => {
      const blockId = await newBlock('expense-1');
      const res = await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId, budgetId, amount: 1500, invoiceRef: 'INV-001' })
        .expect(201);

      approvedExpenseId = res.body.data.id;
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.invoiceRef).toBe('INV-001');
    });

    it('an expense cannot reference a budget of another project', async () => {
      const other = await prisma.project.findFirst({ where: { id: { not: projectId } } });
      const blockId = await newBlock('expense-foreign');
      await http()
        .post(`/api/v1/projects/${other!.id}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId, budgetId, amount: 10 })
        .expect(404);
    });

    it('officer approves the expense → ledger row + budget actualAmount update', async () => {
      const res = await http()
        .patch(`${base()}/financial/expenses/${approvedExpenseId}/status`)
        .set('Authorization', officer)
        .send({ status: 'approved' })
        .expect(200);
      expect(res.body.data.status).toBe('approved');

      const tx = await prisma.projectTransaction.findFirst({
        where: { referenceType: 'expense', referenceId: approvedExpenseId },
      });
      expect(tx).toBeTruthy();
      expect(tx!.type).toBe('expense');
      expect(Number(tx!.amount)).toBe(1500);
      expect(tx!.projectId).toBe(projectBlockId);

      const budget = await prisma.projectBudget.findUnique({ where: { id: budgetId } });
      expect(Number(budget!.actualAmount)).toBe(1500);
    });

    it('approved expenses are immutable: no modify, no delete, no re-decision', async () => {
      await http()
        .patch(`${base()}/financial/expenses/${approvedExpenseId}`)
        .set('Authorization', employee)
        .send({ amount: 9999 })
        .expect(400);
      await http()
        .delete(`${base()}/financial/expenses/${approvedExpenseId}`)
        .set('Authorization', employee)
        .expect(400);
      await http()
        .patch(`${base()}/financial/expenses/${approvedExpenseId}/status`)
        .set('Authorization', admin)
        .send({ status: 'rejected' })
        .expect(400);
    });

    it('a rejected expense writes no ledger row and cannot be re-approved', async () => {
      const blockId = await newBlock('expense-2');
      const created = await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId, budgetId, amount: 500 })
        .expect(201);
      const expenseId = created.body.data.id;

      await http()
        .patch(`${base()}/financial/expenses/${expenseId}/status`)
        .set('Authorization', admin)
        .send({ status: 'rejected' })
        .expect(200);

      const tx = await prisma.projectTransaction.findFirst({
        where: { referenceType: 'expense', referenceId: expenseId },
      });
      expect(tx).toBeNull();

      const budget = await prisma.projectBudget.findUnique({ where: { id: budgetId } });
      expect(Number(budget!.actualAmount)).toBe(1500); // unchanged

      await http()
        .patch(`${base()}/financial/expenses/${expenseId}/status`)
        .set('Authorization', officer)
        .send({ status: 'approved' })
        .expect(400);
    });

    it('an unbudgeted expense can be approved — ledger row, no budget touched', async () => {
      const blockId = await newBlock('expense-3');
      const created = await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId, amount: 250 })
        .expect(201);

      await http()
        .patch(`${base()}/financial/expenses/${created.body.data.id}/status`)
        .set('Authorization', officer)
        .send({ status: 'approved' })
        .expect(200);

      const tx = await prisma.projectTransaction.findFirst({
        where: { referenceType: 'expense', referenceId: created.body.data.id },
      });
      expect(Number(tx!.amount)).toBe(250);

      const budget = await prisma.projectBudget.findUnique({ where: { id: budgetId } });
      expect(Number(budget!.actualAmount)).toBe(1500);
    });

    it('officer records a manual adjustment transaction', async () => {
      const res = await http()
        .post(`${base()}/financial/transactions`)
        .set('Authorization', officer)
        .send({ type: 'adjustment', amount: 100, notes: 'Bank interest' })
        .expect(201);
      expect(res.body.data.type).toBe('adjustment');
    });

    it('the ledger lists all rows: donation income, two expenses, one adjustment', async () => {
      const res = await http()
        .get(`${base()}/financial/transactions`)
        .set('Authorization', officer)
        .expect(200);

      const byType = (type: string) =>
        res.body.data.filter((t: any) => t.type === type).map((t: any) => Number(t.amount));
      expect(byType('income')).toEqual([4000]);
      expect(byType('expense').sort()).toEqual([1500, 250].sort());
      expect(byType('adjustment')).toEqual([100]);
    });

    it('the financial summary matches the expected formula', async () => {
      const res = await http()
        .get(`${base()}/financial/summary`)
        .set('Authorization', officer)
        .expect(200);

      // income(4000) + adjustment(100) vs expenses(1500 + 250)
      expect(res.body.data).toEqual({
        totalIncome: 4100,
        totalExpense: 1750,
        balance: 2350,
        estimatedBudget: 5000,
        approvedBudget: 4000,
        actualSpent: 1500,
      });
    });

    it('deleting a budget orphans its expenses (budgetId set to null — current behavior)', async () => {
      const blockId = await newBlock('budget-2');
      const budget = await http()
        .post(`${base()}/financial/budgets`)
        .set('Authorization', admin)
        .send({ blockId, estimatedAmount: 100 })
        .expect(201);

      const expenseBlock = await newBlock('expense-4');
      const expense = await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId: expenseBlock, budgetId: budget.body.data.id, amount: 10 })
        .expect(201);

      await http()
        .delete(`${base()}/financial/budgets/${budget.body.data.id}`)
        .set('Authorization', admin)
        .expect(200);

      const orphan = await prisma.projectExpense.findUnique({
        where: { id: expense.body.data.id },
      });
      expect(orphan!.budgetId).toBeNull();
    });
  });

  // ─── Progress recalculation & closure ─────────────────────────────────────────

  describe('progress recalculation and project closure', () => {
    it('a second approved donation reaches 100% and closes the project', async () => {
      await pledgeAndApprove(6000);
      await expectProgress(100, true); // (4,000 + 6,000) / 10,000
      await waitForIncomeTransaction(6000);
    });

    it('closed projects cannot be updated', async () => {
      const res = await http()
        .put(`/api/v1/projects/${projectId}`)
        .set('Authorization', admin)
        .send({ location: 'Somewhere else' })
        .expect(400);
      expect(res.body.message).toContain('Completed projects cannot be modified');
    });

    it('execution and spending continue after closure (current behavior)', async () => {
      const blockId = await newBlock('post-closure-task');
      await http()
        .post(`${base()}/execution/tasks`)
        .set('Authorization', employee)
        .send({ blockId })
        .expect(201);

      const expenseBlock = await newBlock('post-closure-expense');
      const expense = await http()
        .post(`${base()}/financial/expenses`)
        .set('Authorization', employee)
        .send({ blockId: expenseBlock, amount: 50 })
        .expect(201);
      await http()
        .patch(`${base()}/financial/expenses/${expense.body.data.id}/status`)
        .set('Authorization', officer)
        .send({ status: 'approved' })
        .expect(200);
    });

    it('progression is capped at 100 even when income exceeds the goal', async () => {
      const summary = await http()
        .get(`${base()}/financial/summary`)
        .set('Authorization', officer)
        .expect(200);
      expect(summary.body.data.totalIncome).toBe(10100); // 4,000 + 6,000 + 100

      await expectProgress(100, true);
    });
  });
});
