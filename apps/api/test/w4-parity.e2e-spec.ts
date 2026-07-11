import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkflowParityService } from '../src/modules/workflow/workflow-parity.service';
import { WorkflowService } from '../src/modules/workflow/workflow.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W4-E2-S2 — the parity harness. The exact lifecycle of the W0 event-emission
 * spec runs with WORKFLOW_ENFORCED=true (engine driving every status write):
 * the legacy event sequence, status responses and side effects must be
 * IDENTICAL; the engine's own audit channel (workflow.* / vote_round.create/
 * close plumbing) is additive on top. Afterwards: step log complete, legacy
 * enums in lockstep (parity job clean), backfill derivation still verified.
 */
describe('Workflow parity harness (W4-E2-S2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let workflow: WorkflowService;
  let parity: WorkflowParityService;
  let captured: DomainEvent[];
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let projectId: number;
  let studyId: number;
  let sectionCount: number;

  const http = () => request(app.getHttpServer());
  // engine plumbing events are the new audit channel — everything else must
  // match the legacy stream exactly
  const ENGINE_PLUMBING = new Set([
    'workflow_instance.started',
    'workflow.transitioned',
    'vote_round.create',
    'vote_round.close',
  ]);
  const legacyNames = () => captured.map((e) => e.event).filter((n) => !ENGINE_PLUMBING.has(n));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    workflow = app.get(WorkflowService);
    parity = app.get(WorkflowParityService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';

    captured = [];
    app.get(EventEmitter2).on('**', (event: DomainEvent) => {
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
  }, 60_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  it('runs the exact W0 lifecycle with the engine driving; endpoint responses identical', async () => {
    ({ projectId } = await createProjectViaApi(app, employee, 'parity', { value: 10000 }));

    const study = await http().post('/api/v1/study').set('Authorization', employee).send({ projectId }).expect(201);
    studyId = study.body.data.id;
    const sectionIds: number[] = study.body.data.sections.map((s: any) => s.id);
    sectionCount = sectionIds.length;

    await http().patch(`/api/v1/study/sections/${sectionIds[0]}`).set('Authorization', admin).send({ assignedTo: 2 }).expect(200);
    for (const sectionId of sectionIds) {
      await http().patch(`/api/v1/study/sections/${sectionId}`).set('Authorization', admin).send({ status: 'completed' }).expect(200);
    }
    // auto-promotion happened through the engine
    expect((await workflow.instanceFor({ subjectType: 'project', subjectId: projectId }))!.currentStateKey).toBe('in_review');

    const published = await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'published' }).expect(200);
    expect(published.body.data.status).toBe('published');

    const votingEndsAt = new Date(Date.now() + 86400000).toISOString();
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_open', votingEndsAt }).expect(200);

    for (const auth of [admin, employee, officer, participant]) {
      await http().post('/api/v1/voting/cast').set('Authorization', auth).send({ studyId, choice: 'for' }).expect(201);
    }
    const results = await http().get(`/api/v1/voting/${studyId}/results`).expect(200);
    expect(results.body.data.total).toBe(4);

    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_closed' }).expect(200);
    const approved = await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.approvedAt).not.toBeNull();

    // failed requests emit nothing and reject with the LEGACY messages
    const before = captured.length;
    await http().post('/api/v1/voting/cast').set('Authorization', participant).send({ studyId, choice: 'against' }).expect(400);
    const invalid = await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'published' }).expect(400);
    expect(invalid.body.message).toContain('Cannot transition from');
    expect(captured.length).toBe(before);

    await http().put(`/api/v1/projects/${projectId}`).set('Authorization', admin).send({ location: 'Parity town' }).expect(200);

    const pledge = await http().post('/api/v1/donations').set('Authorization', participant).send({ projectId, amount: 10000 }).expect(201);
    await http().patch(`/api/v1/donations/${pledge.body.data.id}/status`).set('Authorization', employee).send({ status: 'approved' }).expect(200);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project!.isCompleted).toBe(true);
    expect(Number(project!.progression)).toBe(100);
  });

  it('the legacy event sequence is IDENTICAL to the legacy-path run (W0 spec list)', () => {
    expect(legacyNames()).toEqual([
      // W9: default fund + its category's master fund auto-created on first use
      'fund.created',
      'fund.created',
      'project.created',
      'study.created',
      'study_section.assigned',
      ...Array(sectionCount).fill('study_section.completed'),
      'study.published',
      'vote_round.opened',
      'voting.opened',
      'vote.cast',
      'vote.cast',
      'vote.cast',
      'vote.cast',
      'vote_round.closed',
      'voting.closed',
      'board_decision.recorded',
      'study.approved',
      'project.updated',
      'donation.pledged',
      'donation.approved',
      // W9: fund-routed donation — two ledger postings + the auto-allocation's disbursed event
      'ledger.posted',
      'ledger.posted',
      'allocation.disbursed',
      'project.closed',
    ]);
  });

  it('the step log is complete for the full lifecycle (DoD spot-check)', async () => {
    const instance = await workflow.instanceFor({ subjectType: 'project', subjectId: projectId });
    expect(instance!.currentStateKey).toBe('completed');
    const steps = await prisma.workflowStepLog.findMany({
      where: { instanceId: instance!.id },
      orderBy: { id: 'asc' },
    });
    expect(steps.map((s) => s.actionKey)).toEqual([
      'start',
      'submit',
      'publish',
      'open_voting',
      'close_voting',
      'approve',
      'open_donations',
      'complete',
    ]);
  });

  it('legacy enum columns stayed in lockstep: the nightly parity check is clean', async () => {
    expect(await parity.check()).toEqual([]);
  });

  it('the engine gate rejects a donation to a completed project with the legacy message', async () => {
    const res = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 10 })
      .expect(400);
    expect(res.body.message).toContain('no longer accepting donations');
  });

  it('availableTransitions drives the UI: instance endpoint returns state, log and actions', async () => {
    const res = await http().get(`/api/v1/workflow/projects/${projectId}`).set('Authorization', admin).expect(200);
    expect(res.body.data.currentStateKey).toBe('completed');
    expect(res.body.data.stepLogs.length).toBeGreaterThanOrEqual(8);
    expect(res.body.data.availableTransitions).toEqual([]); // terminal state
  });
});
