import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

/**
 * W0-E4-S4 — soft-delete canary: with SOFT_DELETE_ENFORCED on, soft-delete
 * one of each entity type through its real DELETE endpoint, then walk every
 * list/detail endpoint asserting the rows are invisible while still present
 * (stamped) in the database. Also pins flag-OFF legacy behavior (W0-E4-S3 AC).
 */
describe('Soft-delete canary (W0-E4-S3/S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let captured: DomainEvent[];
  let admin: string;
  let employee: string;
  let adminUserId: number;

  // Entity graph on project A (stays alive; its children get deleted)
  let projectId: number;
  let phaseId: number;
  let taskId: number;
  let stepId: number;
  let milestoneId: number;
  let expenseId: number;
  // Separately deleted wholes
  let deletedProjectId: number;
  let deletedStudyId: number;
  let deletedBlockId: number;

  const http = () => request(app.getHttpServer());

  const expectStamped = async (model: string, id: number) => {
    const row = await (prisma as any)[model].findFirst({
      where: { id },
      includeDeleted: true,
    });
    expect(row).not.toBeNull();
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.deletedBy).toBe(adminUserId);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    captured = [];
    app.get(EventEmitter2).on('**', (event: DomainEvent) => {
      if (event && typeof event === 'object' && 'event' in event) captured.push(event);
    });

    admin = await authHeaderFor(prisma, 'administrator');
    employee = await authHeaderFor(prisma, 'employee');
    adminUserId = (await prisma.user.findUnique({
      where: { email: SEED_ACCOUNTS.administrator.email },
    }))!.id;

    // Project A with one of each execution/financial entity
    ({ projectId } = await createProjectViaApi(app, employee, 'canary-a'));
    const phaseBlock = await createBlockViaApi(app, employee, 'canary-phase');
    phaseId = (
      await http().post(`/api/v1/projects/${projectId}/execution/phases`).set('Authorization', employee).send({ blockId: phaseBlock }).expect(201)
    ).body.data.id;
    const taskBlock = await createBlockViaApi(app, employee, 'canary-task');
    taskId = (
      await http().post(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).send({ blockId: taskBlock, phaseId }).expect(201)
    ).body.data.id;
    const stepBlock = await createBlockViaApi(app, employee, 'canary-step');
    stepId = (
      await http().post(`/api/v1/projects/${projectId}/execution/steps`).set('Authorization', employee).send({ blockId: stepBlock }).expect(201)
    ).body.data.id;
    const milestoneBlock = await createBlockViaApi(app, employee, 'canary-milestone');
    milestoneId = (
      await http().post(`/api/v1/projects/${projectId}/milestones`).set('Authorization', employee).send({ blockId: milestoneBlock }).expect(201)
    ).body.data.id;
    const expenseBlock = await createBlockViaApi(app, employee, 'canary-expense');
    expenseId = (
      await http().post(`/api/v1/projects/${projectId}/financial/expenses`).set('Authorization', employee).send({ blockId: expenseBlock, amount: 10 }).expect(201)
    ).body.data.id;

    // Project B (whole project + draft study get deleted) and a lone block
    ({ projectId: deletedProjectId } = await createProjectViaApi(app, employee, 'canary-b'));
    deletedStudyId = (
      await http().post('/api/v1/study').set('Authorization', employee).send({ projectId: deletedProjectId }).expect(201)
    ).body.data.id;
    deletedBlockId = await createBlockViaApi(app, employee, 'canary-lone-block');

    process.env.SOFT_DELETE_ENFORCED = 'true';
  });

  afterAll(async () => {
    delete process.env.SOFT_DELETE_ENFORCED;
    await app.close();
  });

  it('soft-deletes one of each entity type through the real endpoints; rows persist stamped', async () => {
    await http().delete(`/api/v1/projects/${projectId}/execution/tasks/${taskId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/projects/${projectId}/execution/phases/${phaseId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/projects/${projectId}/execution/steps/${stepId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/projects/${projectId}/milestones/${milestoneId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/projects/${projectId}/financial/expenses/${expenseId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/study/${deletedStudyId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/projects/${deletedProjectId}`).set('Authorization', admin).expect(200);
    await http().delete(`/api/v1/blocks/${deletedBlockId}`).set('Authorization', admin).expect(200);

    await expectStamped('projectTask', taskId);
    await expectStamped('projectPhase', phaseId);
    await expectStamped('projectStep', stepId);
    await expectStamped('projectMilestone', milestoneId);
    await expectStamped('projectExpense', expenseId);
    await expectStamped('projectStudy', deletedStudyId);
    await expectStamped('project', deletedProjectId);
    await expectStamped('block', deletedBlockId);
  });

  it('every deletion emitted its *.deleted event with the deleting admin as actor', () => {
    const deleted = captured.filter((e) => e.event.endsWith('.deleted'));
    expect(deleted.map((e) => e.event).sort()).toEqual([
      'block.deleted',
      'milestone.deleted',
      'phase.deleted',
      'project.deleted',
      'step.deleted',
      'study.deleted',
      'task.deleted',
    ].sort().concat().sort());
    expect(deleted.filter((e) => e.event === 'expense.deleted')).toHaveLength(0); // expenses: no event required, none emitted
    expect(deleted.every((e) => e.actor.userId === adminUserId)).toBe(true);
  });

  it('deleted rows are invisible in every list endpoint', async () => {
    const phases = await http().get(`/api/v1/projects/${projectId}/execution/phases`).set('Authorization', employee).expect(200);
    expect(phases.body.data.map((p: any) => p.id)).not.toContain(phaseId);

    const tasks = await http().get(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).expect(200);
    expect(tasks.body.data.map((t: any) => t.id)).not.toContain(taskId);

    const steps = await http().get(`/api/v1/projects/${projectId}/execution/steps`).set('Authorization', employee).expect(200);
    expect(steps.body.data.map((s: any) => s.id)).not.toContain(stepId);

    const milestones = await http().get(`/api/v1/projects/${projectId}/milestones`).set('Authorization', employee).expect(200);
    expect(milestones.body.data.map((m: any) => m.id)).not.toContain(milestoneId);

    const expenses = await http().get(`/api/v1/projects/${projectId}/financial/expenses`).set('Authorization', employee).expect(200);
    expect(expenses.body.data.map((e: any) => e.id)).not.toContain(expenseId);

    const projects = await http().get('/api/v1/projects?limit=100').expect(200);
    expect(projects.body.data.data.map((p: any) => p.id)).not.toContain(deletedProjectId);

    const studies = await http().get('/api/v1/study?limit=100').set('Authorization', admin).expect(200);
    expect(studies.body.data.data.map((s: any) => s.id)).not.toContain(deletedStudyId);

    const blocks = await http().get('/api/v1/blocks?limit=100').expect(200);
    expect(blocks.body.data.data.map((b: any) => b.id)).not.toContain(deletedBlockId);
  });

  it('deleted rows are invisible in every detail endpoint', async () => {
    await http().get(`/api/v1/projects/${deletedProjectId}`).expect(404);
    await http().get(`/api/v1/study/${deletedStudyId}`).set('Authorization', admin).expect(404);
    await http().get(`/api/v1/blocks/${deletedBlockId}`).expect(404);
  });

  it('financial summary aggregates exclude soft-deleted expenses', async () => {
    const summary = await http()
      .get(`/api/v1/projects/${projectId}/financial/summary`)
      .set('Authorization', admin)
      .expect(200);
    expect(summary.body.data.actualSpent).toBe(0);
    expect(summary.body.data.totalExpense).toBe(0);
  });

  it('soft-deleted entities cannot be deleted again (already invisible → 404)', async () => {
    await http().delete(`/api/v1/projects/${deletedProjectId}`).set('Authorization', admin).expect(404);
    await http().delete(`/api/v1/projects/${projectId}/execution/tasks/${taskId}`).set('Authorization', admin).expect(404);
  });

  it('flag OFF: legacy hard delete still works (W0-E4-S3 AC, both modes)', async () => {
    process.env.SOFT_DELETE_ENFORCED = 'false';
    try {
      const taskBlock = await createBlockViaApi(app, employee, 'canary-legacy-task');
      const legacyTask = (
        await http().post(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).send({ blockId: taskBlock }).expect(201)
      ).body.data.id;

      await http().delete(`/api/v1/projects/${projectId}/execution/tasks/${legacyTask}`).set('Authorization', admin).expect(200);

      const gone = await prisma.projectTask.findFirst({
        where: { id: legacyTask },
        includeDeleted: true,
      } as any);
      expect(gone).toBeNull(); // physically removed

      // task.deleted still emitted in legacy mode — the fact happened either way
      expect(captured.filter((e) => e.event === 'task.deleted')).toHaveLength(2);
    } finally {
      process.env.SOFT_DELETE_ENFORCED = 'true';
    }
  });
});
