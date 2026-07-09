import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkflowService } from '../src/modules/workflow/workflow.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W4-E1 — the engine itself: three operations, atomic guard re-check under a
 * row lock (concurrent execute race: one wins), failed transitions emit
 * nothing and leave no step log, effects fire exactly once, guard verdicts
 * carry reasons.
 */
describe('Workflow engine core (W4-E1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let workflow: WorkflowService;
  let captured: DomainEvent[];
  let admin: string;
  let adminActor: { userId: number; referenceType: string; requestId: string; ip: null };
  let participantActor: { userId: number; referenceType: string; requestId: string; ip: null };
  let projectId: number;

  const subject = () => ({ subjectType: 'project', subjectId: projectId });
  const workflowEvents = () => captured.filter((e) => e.event === 'workflow.transitioned');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    workflow = app.get(WorkflowService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';

    captured = [];
    app.get(EventEmitter2).on('**', (event: DomainEvent) => {
      if (event && typeof event === 'object' && 'event' in event) captured.push(event);
    });

    admin = await authHeaderFor(prisma, 'administrator');
    const adminUser = await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.administrator.email } });
    const participantUser = await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.participant.email } });
    adminActor = { userId: adminUser!.id, referenceType: 'admin', requestId: 'w4-test', ip: null };
    participantActor = { userId: participantUser!.id, referenceType: 'participant', requestId: 'w4-test', ip: null };

    ({ projectId } = await createProjectViaApi(app, admin, 'engine', { value: 1000 }));
    // a study makes the board_decision/sections guards resolve their real subject
    await request(app.getHttpServer()).post('/api/v1/study').set('Authorization', admin).send({ projectId }).expect(201);
  }, 60_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  it('start: new projects get an instance at the initial state; a second start conflicts', async () => {
    const instance = await workflow.instanceFor(subject());
    expect(instance).not.toBeNull();
    expect(instance!.currentStateKey).toBe('draft');
    expect(instance!.definition.key).toBe('project-lifecycle');
    expect(instance!.definition.version).toBe(1);

    await expect(workflow.start(adminActor, subject(), 'project-lifecycle')).rejects.toThrow(
      /already has a workflow instance/,
    );
  });

  it('availableTransitions: guard-evaluated per actor, with denial reasons', async () => {
    const forAdmin = await workflow.availableTransitions(adminActor, subject());
    const submit = forAdmin.find((t) => t.actionKey === 'submit');
    expect(submit).toMatchObject({ allowed: true, toStateKey: 'in_review' });
    // no transition from a state the instance is not in
    expect(forAdmin.find((t) => t.actionKey === 'publish')).toBeUndefined();

    const forParticipant = await workflow.availableTransitions(participantActor, subject());
    const submitDenied = forParticipant.find((t) => t.actionKey === 'submit');
    expect(submitDenied!.allowed).toBe(false);
    expect(submitDenied!.deniedBy).toContain('denied:role');
  });

  it('a guard-blocked execute changes nothing: no state move, no step log, no events', async () => {
    const stepsBefore = await prisma.workflowStepLog.count();
    const eventsBefore = workflowEvents().length;

    await expect(workflow.execute(participantActor, subject(), 'submit')).rejects.toThrow(/blocked: denied:role/);

    const instance = await workflow.instanceFor(subject());
    expect(instance!.currentStateKey).toBe('draft');
    expect(await prisma.workflowStepLog.count()).toBe(stepsBefore);
    expect(workflowEvents().length).toBe(eventsBefore);
  });

  it('an invalid action is rejected with the current state in the reason', async () => {
    await expect(workflow.execute(adminActor, subject(), 'approve')).rejects.toThrow(/Cannot "approve" from "draft"/);
  });

  it('concurrent execute: exactly one transition wins (row lock)', async () => {
    const results = await Promise.allSettled([
      workflow.execute(adminActor, subject(), 'submit'),
      workflow.execute(adminActor, subject(), 'submit'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const instance = await workflow.instanceFor(subject());
    expect(instance!.currentStateKey).toBe('in_review');
    const submits = await prisma.workflowStepLog.findMany({
      where: { instance: { subjectType: 'project', subjectId: projectId }, actionKey: 'submit' },
    });
    expect(submits).toHaveLength(1);
  });

  it('effects fire exactly once per successful transition', async () => {
    const before = captured.filter((e) => e.event === 'study.published').length;
    // in_review → published carries the study.published effect (engine-emitted
    // here since no service is suppressing it in a direct engine call)
    await workflow.execute(adminActor, subject(), 'publish');
    expect(captured.filter((e) => e.event === 'study.published').length).toBe(before + 1);
    expect(workflowEvents().at(-1)!.data).toMatchObject({ action: 'publish', fromState: 'in_review', toState: 'published' });
  });

  it('board_decision guard denies until the decision row exists', async () => {
    await workflow.execute(adminActor, subject(), 'open_voting');
    await workflow.execute(adminActor, subject(), 'close_voting');

    const transitions = await workflow.availableTransitions(adminActor, subject());
    const approve = transitions.find((t) => t.actionKey === 'approve');
    expect(approve!.allowed).toBe(false);
    expect(approve!.deniedBy).toContain('board_decision:approved-missing');

    await expect(workflow.execute(adminActor, subject(), 'approve')).rejects.toThrow(/board_decision:approved-missing/);
  });

  it('the step log is append-only and complete for the run', async () => {
    const instance = await workflow.instanceFor(subject());
    const steps = await prisma.workflowStepLog.findMany({
      where: { instanceId: instance!.id },
      orderBy: { id: 'asc' },
    });
    expect(steps.map((s) => s.actionKey)).toEqual(['start', 'submit', 'publish', 'open_voting', 'close_voting']);
    expect(steps.map((s) => s.toStateKey)).toEqual(['draft', 'in_review', 'published', 'voting_open', 'voting_closed']);
  });
});
