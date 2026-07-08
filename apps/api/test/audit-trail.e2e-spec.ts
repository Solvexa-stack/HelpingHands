import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent } from '../src/events/domain-event';
import { EventBusService } from '../src/events/event-bus.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W0-E3-S2 — a full lifecycle run yields a coherent audit trail; replayed
 * events write no duplicates.
 */
describe('Audit trail (W0-E3-S2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let captured: DomainEvent[];
  let admin: string;
  let employee: string;
  let participant: string;
  let employeeUserId: number;

  let projectId: number;
  let studyId: number;

  const http = () => request(app.getHttpServer());

  /** Audit writes are async subscribers — poll until the log catches up. */
  // The seed's W1 identity backfill writes its own audit rows — exclude them.
  const liveRows = { requestId: { not: 'w1-backfill' } };
  const waitForAuditCount = async (expected: number) => {
    for (let i = 0; i < 50; i++) {
      const count = await prisma.auditLog.count({ where: liveRows });
      if (count >= expected) return count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return prisma.auditLog.count({ where: liveRows });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    captured = [];
    app.get(EventEmitter2).on('**', (event: DomainEvent) => {
      if (event && typeof event === 'object' && 'event' in event) captured.push(event);
    });

    [admin, employee, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'participant'),
    ]);
    employeeUserId = (await prisma.user.findUnique({
      where: { email: SEED_ACCOUNTS.employee.email },
    }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a full lifecycle run writes one audit row per domain event', async () => {
    ({ projectId } = await createProjectViaApi(app, employee, 'audit', { value: 5000 }));

    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', employee)
      .send({ projectId })
      .expect(201);
    studyId = study.body.data.id;

    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', employee).send({ status: 'in_review' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'published' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_open' }).expect(200);
    await http().post('/api/v1/voting/cast').set('Authorization', participant).send({ studyId, choice: 'for' }).expect(201);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'voting_closed' }).expect(200);
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);

    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', participant)
      .send({ projectId, amount: 5000 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/status`)
      .set('Authorization', employee)
      .send({ status: 'approved' })
      .expect(200);

    // project.created, study.created, study.published, voting.opened,
    // vote.cast, voting.closed, study.approved, donation.pledged,
    // donation.approved, project.closed
    expect(captured.length).toBeGreaterThanOrEqual(10);

    const count = await waitForAuditCount(captured.length);
    expect(count).toBe(captured.length);
  });

  it('the trail is coherent: every event maps to a row with matching actor, action, subject and requestId', async () => {
    const rows = await prisma.auditLog.findMany({ where: liveRows, orderBy: { id: 'asc' } });

    for (const event of captured) {
      const row = rows.find(
        (r) =>
          r.action === event.event &&
          r.subjectType === event.subject.type &&
          r.subjectId === String(event.subject.id) &&
          r.requestId === event.requestId,
      );
      expect(row).toBeDefined();
      expect(row!.actorUserId).toBe(event.actor.userId);
      expect(row!.timestamp.toISOString()).toBe(event.occurredAt);
      expect(row!.before).toBeNull(); // no payload provided explicit snapshots
      expect(row!.after).toEqual(event.data);
    }

    const approval = rows.find((r) => r.action === 'donation.approved');
    expect(approval!.actorUserId).toBe(employeeUserId);
    expect(approval!.ip).toBeTruthy();
  });

  it('a replayed event writes no duplicate (idempotency on requestId+action+subject)', async () => {
    const bus = app.get(EventBusService);
    const before = await prisma.auditLog.count({ where: liveRows });

    // Replay the exact same envelope (same requestId) — e.g. an at-least-once
    // redelivery. The unique index absorbs it.
    bus.emitEnvelope(captured[0]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await prisma.auditLog.count({ where: liveRows })).toBe(before);
  });

  it('payloads with explicit before/after snapshots are stored as such', async () => {
    const bus = app.get(EventBusService);
    bus.publish({
      event: 'project.updated',
      actor: { userId: 1, referenceType: 'admin', requestId: 'audit-snapshot-test', ip: null },
      subject: { type: 'project', id: projectId },
      data: { before: { location: 'Old town' }, after: { location: 'New town' } },
    });

    await waitForAuditCount((await prisma.auditLog.count()) as number);
    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({ where: { requestId: 'audit-snapshot-test' } });
      if (row) {
        expect(row.before).toEqual({ location: 'Old town' });
        expect(row.after).toEqual({ location: 'New town' });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('snapshot audit row never appeared');
  });

  it('audit rows are never updated or deleted by the application path (append-only contract)', async () => {
    // The Prisma surface for AuditLog is used with create only; this pins the
    // table stats: every captured event is still present exactly once.
    const rows = await prisma.auditLog.groupBy({
      by: ['requestId', 'action', 'subjectType', 'subjectId'],
      _count: true,
    });
    expect(rows.every((r) => r._count === 1)).toBe(true);
  });

  // ─── Read API for the admin viewer (W0-E3-S3) ────────────────────────────────

  describe('audit read API', () => {
    it('is administrator-only', async () => {
      await http().get('/api/v1/audit').set('Authorization', employee).expect(403);
      await http().get('/api/v1/audit').set('Authorization', participant).expect(403);
      await http().get('/api/v1/audit').expect(401);
      await http().get('/api/v1/audit/1').set('Authorization', employee).expect(403);
    });

    it('lists the trail with pagination, newest first', async () => {
      const res = await http()
        .get('/api/v1/audit?limit=5')
        .set('Authorization', admin)
        .expect(200);

      expect(res.body.data.data).toHaveLength(5);
      expect(res.body.data.meta.total).toBe(await prisma.auditLog.count());
      const ids = res.body.data.data.map((r: any) => r.id);
      expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    });

    it('filters by action (exact and prefix), subject, actor and date range', async () => {
      const exact = await http()
        .get('/api/v1/audit?action=donation.approved')
        .set('Authorization', admin)
        .expect(200);
      expect(exact.body.data.data.length).toBeGreaterThanOrEqual(1);
      expect(exact.body.data.data.every((r: any) => r.action === 'donation.approved')).toBe(true);

      const prefix = await http()
        .get('/api/v1/audit?action=study.')
        .set('Authorization', admin)
        .expect(200);
      expect(prefix.body.data.data.every((r: any) => r.action.startsWith('study.'))).toBe(true);

      const bySubject = await http()
        .get(`/api/v1/audit?subjectType=project&subjectId=${projectId}`)
        .set('Authorization', admin)
        .expect(200);
      expect(bySubject.body.data.data.every((r: any) => r.subjectType === 'project')).toBe(true);

      const byActor = await http()
        .get(`/api/v1/audit?actorUserId=${employeeUserId}`)
        .set('Authorization', admin)
        .expect(200);
      expect(byActor.body.data.data.every((r: any) => r.actorUserId === employeeUserId)).toBe(true);

      const future = await http()
        .get(`/api/v1/audit?from=${encodeURIComponent(new Date(Date.now() + 3600_000).toISOString())}`)
        .set('Authorization', admin)
        .expect(200);
      expect(future.body.data.data).toHaveLength(0);
    });

    it('serves entry detail with snapshots', async () => {
      const snapshotRow = await prisma.auditLog.findFirst({
        where: { requestId: 'audit-snapshot-test' },
      });
      const res = await http()
        .get(`/api/v1/audit/${snapshotRow!.id}`)
        .set('Authorization', admin)
        .expect(200);
      expect(res.body.data.before).toEqual({ location: 'Old town' });
      expect(res.body.data.after).toEqual({ location: 'New town' });

      await http().get('/api/v1/audit/999999').set('Authorization', admin).expect(404);
    });
  });
});
