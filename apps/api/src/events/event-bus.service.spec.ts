import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { systemActor, ActorContext } from './actor-context';
import { DomainEvent } from './domain-event';

describe('EventBusService', () => {
  let bus: EventBusService;
  let emitter: EventEmitter2;

  const actor: ActorContext = {
    userId: 42,
    referenceType: 'admin',
    requestId: 'req-123',
    ip: '10.0.0.1',
  };

  const sampleInput = {
    event: 'project.created',
    actor,
    subject: { type: 'project', id: 7 },
    data: { value: 50000 },
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [EventBusService],
    }).compile();

    bus = moduleRef.get(EventBusService);
    emitter = moduleRef.get(EventEmitter2);
  });

  describe('publish', () => {
    it('emits a complete envelope', () => {
      const received: DomainEvent[] = [];
      emitter.on('project.created', (e: DomainEvent) => received.push(e));

      const before = Date.now();
      bus.publish(sampleInput);

      expect(received).toHaveLength(1);
      const envelope = received[0];
      expect(envelope.event).toBe('project.created');
      expect(envelope.version).toBe(1);
      expect(envelope.actor).toEqual(actor);
      expect(envelope.subject).toEqual({ type: 'project', id: 7 });
      expect(envelope.data).toEqual({ value: 50000 });
      expect(envelope.requestId).toBe('req-123');
      expect(new Date(envelope.occurredAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('supports payload version overrides', () => {
      const envelope = bus.publish({ ...sampleInput, version: 2 });
      expect(envelope.version).toBe(2);
    });

    it('reaches wildcard subscribers (audit-module pattern)', () => {
      const received: DomainEvent[] = [];
      emitter.on('**', (e: DomainEvent) => received.push(e));

      bus.publish(sampleInput);
      bus.publish({ ...sampleInput, event: 'study_section.assigned' });

      expect(received.map((e) => e.event)).toEqual([
        'project.created',
        'study_section.assigned',
      ]);
    });

    it('rejects names that break the noun.verb-past convention', () => {
      for (const bad of ['ProjectCreated', 'project', 'project.Created', 'project created', '.created']) {
        expect(() => bus.publish({ ...sampleInput, event: bad })).toThrow(/Invalid domain event name/);
      }
    });

    it('never propagates subscriber errors to the publisher', () => {
      emitter.on('project.created', () => {
        throw new Error('broken subscriber');
      });
      expect(() => bus.publish(sampleInput)).not.toThrow();
    });

    it('system actor events carry a generated requestId', () => {
      const envelope = bus.publish({ ...sampleInput, actor: systemActor() });
      expect(envelope.actor.userId).toBeNull();
      expect(envelope.actor.referenceType).toBe('system');
      expect(envelope.requestId).toBeTruthy();
    });
  });

  describe('publishAfterCommit', () => {
    it('holds events until the work resolves, then emits in order', async () => {
      const received: string[] = [];
      emitter.on('**', (e: DomainEvent) => received.push(e.event));

      await bus.publishAfterCommit(async (events) => {
        events.add(sampleInput);
        events.add({ ...sampleInput, event: 'study.created' });
        expect(received).toHaveLength(0); // nothing emitted mid-transaction
        expect(events.size).toBe(2);
      });

      expect(received).toEqual(['project.created', 'study.created']);
    });

    it('emits nothing when the work throws (rollback)', async () => {
      const received: DomainEvent[] = [];
      emitter.on('**', (e: DomainEvent) => received.push(e));

      await expect(
        bus.publishAfterCommit(async (events) => {
          events.add(sampleInput);
          throw new Error('transaction rolled back');
        }),
      ).rejects.toThrow('transaction rolled back');

      expect(received).toHaveLength(0);
    });

    it('returns the result of the work', async () => {
      const result = await bus.publishAfterCommit(async () => 'tx-result');
      expect(result).toBe('tx-result');
    });

    it('validates event names at add() time, inside the transaction', async () => {
      await expect(
        bus.publishAfterCommit(async (events) => {
          events.add({ ...sampleInput, event: 'NotAnEvent' });
        }),
      ).rejects.toThrow(/Invalid domain event name/);
    });

    it('stamps occurredAt when the fact happened, not when flushed', async () => {
      let addedAt = 0;
      const received: DomainEvent[] = [];
      emitter.on('**', (e: DomainEvent) => received.push(e));

      await bus.publishAfterCommit(async (events) => {
        events.add(sampleInput);
        addedAt = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      expect(new Date(received[0].occurredAt).getTime()).toBeLessThanOrEqual(addedAt + 5);
    });
  });
});
