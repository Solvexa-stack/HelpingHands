import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { VotingService } from '../src/modules/voting/voting.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W0-E2-S3 — one full lifecycle run produces the complete expected domain
 * event sequence, with correct actors and requestIds; failed requests emit
 * nothing; the cron auto-close emits with a system actor.
 */
describe('Domain event emission: projects, study, voting (W0-E2-S3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let captured: DomainEvent[];
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let adminUserId: number;
  let employeeUserId: number;

  let projectId: number;
  let studyId: number;
  let sectionIds: number[];
  let sectionCount: number;

  const http = () => request(app.getHttpServer());
  const names = () => captured.map((e) => e.event);
  const byName = (name: string) => captured.filter((e) => e.event === name);

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
    adminUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.administrator.email } }))!.id;
    employeeUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.employee.email } }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('project.created is emitted once, with the creating employee as actor', async () => {
    ({ projectId } = await createProjectViaApi(app, employee, 'events', { value: 10000 }));

    const events = byName('project.created');
    expect(events).toHaveLength(1);
    expect(events[0].subject).toEqual({ type: 'project', id: projectId });
    expect(events[0].actor.userId).toBe(employeeUserId);
    expect(events[0].actor.referenceType).toBe('admin');
    expect(events[0].requestId).toBe(events[0].actor.requestId);
    expect(events[0].data).toEqual({ blockId: expect.any(Number), category: 'agricultural', value: 10000 });
  });

  it('study.created carries the section count', async () => {
    const res = await http()
      .post('/api/v1/study')
      .set('Authorization', employee)
      .send({ projectId })
      .expect(201);
    studyId = res.body.data.id;
    sectionIds = res.body.data.sections.map((s: any) => s.id);
    sectionCount = sectionIds.length;

    const events = byName('study.created');
    expect(events).toHaveLength(1);
    expect(events[0].subject).toEqual({ type: 'study', id: studyId });
    expect(events[0].data).toEqual({ projectId, sections: sectionCount });
  });

  it('section assignment and completion emit study_section events', async () => {
    await http()
      .patch(`/api/v1/study/sections/${sectionIds[0]}`)
      .set('Authorization', admin)
      .send({ assignedTo: 2 })
      .expect(200);

    for (const sectionId of sectionIds) {
      await http()
        .patch(`/api/v1/study/sections/${sectionId}`)
        .set('Authorization', admin)
        .send({ status: 'completed' })
        .expect(200);
    }

    expect(byName('study_section.assigned')).toHaveLength(1);
    expect(byName('study_section.assigned')[0].data).toEqual({ studyId, assignedTo: 2 });
    expect(byName('study_section.completed')).toHaveLength(sectionCount);
    // the auto-transition to in_review is deliberately not announced
    expect(names()).not.toContain('study.submitted');
  });

  it('publish → voting.opened → 4 votes → close → approve, each exactly once', async () => {
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'published' }).expect(200);

    const votingEndsAt = new Date(Date.now() + 86400000).toISOString();
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_open', votingEndsAt }).expect(200);

    for (const auth of [admin, employee, officer, participant]) {
      await http().post('/api/v1/voting/cast').set('Authorization', auth).send({ studyId, choice: 'for' }).expect(201);
    }

    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_closed' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);

    expect(byName('study.published')).toHaveLength(1);

    const opened = byName('voting.opened');
    expect(opened).toHaveLength(1);
    expect(opened[0].data.votingEndsAt).toBe(votingEndsAt);

    const votes = byName('vote.cast');
    expect(votes).toHaveLength(4);
    expect(new Set(votes.map((v) => v.actor.userId)).size).toBe(4); // four distinct voters
    expect(votes.every((v) => (v.data as any).studyId === studyId)).toBe(true);

    expect(byName('voting.closed')).toHaveLength(1);
    expect(byName('voting.closed')[0].actor.userId).toBe(adminUserId);

    const approved = byName('study.approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].actor.userId).toBe(adminUserId);
    expect(approved[0].actor.referenceType).toBe('admin');
  });

  it('failed requests emit nothing (vote after close, invalid transition, forbidden publish)', async () => {
    const before = captured.length;

    await http().post('/api/v1/voting/cast').set('Authorization', participant).send({ studyId, choice: 'against' }).expect(400);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'published' }).expect(400);
    // On a terminal study the transition guard (400) fires before the role guard
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', employee).send({ status: 'voting_open' }).expect(400);

    expect(captured.length).toBe(before);
  });

  it('project.updated propagates the inbound X-Request-Id into the envelope', async () => {
    await http()
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .set('x-request-id', 'trace-emission-42')
      .send({ location: 'Event town' })
      .expect(200);

    const events = byName('project.updated');
    expect(events).toHaveLength(1);
    expect(events[0].requestId).toBe('trace-emission-42');
    expect(events[0].actor.requestId).toBe('trace-emission-42');
    expect(events[0].data).toEqual({ changedFields: ['location'] });
  });

  it('funding to 100% emits project.closed with the approving employee as actor (ALS propagation)', async () => {
    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 10000 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(200);

    const closed = byName('project.closed');
    expect(closed).toHaveLength(1);
    expect(closed[0].subject).toEqual({ type: 'project', id: projectId });
    expect(closed[0].actor.userId).toBe(employeeUserId); // via AsyncLocalStorage, not threading
    expect(closed[0].data).toEqual({ value: 10000, collected: 10000, progression: 100 });
  });

  it('the full lifecycle produced exactly the expected event sequence', () => {
    expect(names()).toEqual([
      'project.created',
      'study.created',
      'study_section.assigned',
      ...Array(sectionCount).fill('study_section.completed'),
      'study.published',
      'voting.opened',
      'vote.cast',
      'vote.cast',
      'vote.cast',
      'vote.cast',
      'voting.closed',
      'study.approved',
      'project.updated',
      'donation.pledged', // funding step — donation events joined the stream in S4
      'donation.approved',
      'project.closed',
    ]);

    // Envelope invariants hold across the board
    for (const event of captured) {
      expect(event.version).toBe(1);
      expect(event.requestId).toBeTruthy();
      expect(event.requestId).toBe(event.actor.requestId);
      expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    }
  });

  it('cron auto-close emits voting.closed with a system actor', async () => {
    // Second project walked to voting_open with an already-expired deadline
    const other = await createProjectViaApi(app, employee, 'events-autoclose');
    const study = await http().post('/api/v1/study').set('Authorization', employee).send({ projectId: other.projectId }).expect(201);
    await http().patch(`/api/v1/study/${study.body.data.id}/status`).set('Authorization', employee).send({ status: 'in_review' }).expect(200);
    await http().patch(`/api/v1/study/${study.body.data.id}/status`).set('Authorization', admin).send({ status: 'published' }).expect(200);
    await http()
      .patch(`/api/v1/study/${study.body.data.id}/status`)
      .set('Authorization', admin)
      .send({ status: 'voting_open', votingEndsAt: new Date(Date.now() - 1000).toISOString() })
      .expect(200);

    const before = byName('voting.closed').length;
    const result = await app.get(VotingService).autoCloseExpiredVotings();
    expect(result.closed).toBe(1);

    const closures = byName('voting.closed');
    expect(closures).toHaveLength(before + 1);
    const auto = closures[closures.length - 1];
    expect(auto.actor.referenceType).toBe('system');
    expect(auto.actor.userId).toBeNull();
    expect(auto.data).toMatchObject({ auto: true, projectId: other.projectId });
  });
});
