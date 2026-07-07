import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventBusService } from '../src/events/event-bus.service';
import { systemActor } from '../src/events/actor-context';
import { DomainEvent } from '../src/events/domain-event';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

/**
 * W0-E2-S1 AC proof over REAL Prisma transactions: a sample event emitted
 * from inside prisma.$transaction fires only after commit; on rollback the
 * write is gone AND no event was emitted.
 */
describe('Domain event bus over real transactions (W0-E2-S1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: EventBusService;
  let emitter: EventEmitter2;
  let received: DomainEvent[];

  const actor = systemActor('e2e-events-run');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = app.get(EventBusService);
    emitter = app.get(EventEmitter2);
    await resetDatabase(prisma);
  });

  beforeEach(() => {
    received = [];
    emitter.on('language.created', (e: DomainEvent) => received.push(e));
  });

  afterEach(() => {
    emitter.removeAllListeners('language.created');
  });

  afterAll(async () => {
    await app.close();
  });

  it('commit: the row exists and the event fired exactly once, after commit', async () => {
    const language = await bus.publishAfterCommit(async (events) => {
      return prisma.$transaction(async (tx) => {
        const created = await tx.language.create({
          data: { name: 'Testish', code: 'xx', direction: 'ltr', order: 99, isActive: false },
        });
        events.add({
          event: 'language.created',
          actor,
          subject: { type: 'language', id: created.id },
          data: { code: created.code },
        });
        expect(received).toHaveLength(0); // not yet committed → not yet emitted
        return created;
      });
    });

    expect(received).toHaveLength(1);
    expect(received[0].subject).toEqual({ type: 'language', id: language.id });
    expect(received[0].requestId).toBe('e2e-events-run');
    expect(await prisma.language.findUnique({ where: { code: 'xx' } })).toBeTruthy();
  });

  it('rollback: the row is gone and no event was emitted', async () => {
    await expect(
      bus.publishAfterCommit(async (events) => {
        return prisma.$transaction(async (tx) => {
          const created = await tx.language.create({
            data: { name: 'Ghostish', code: 'zz', direction: 'ltr', order: 98, isActive: false },
          });
          events.add({
            event: 'language.created',
            actor,
            subject: { type: 'language', id: created.id },
            data: { code: created.code },
          });
          throw new Error('force rollback');
        });
      }),
    ).rejects.toThrow('force rollback');

    expect(received).toHaveLength(0);
    expect(await prisma.language.findUnique({ where: { code: 'zz' } })).toBeNull();
  });
});
