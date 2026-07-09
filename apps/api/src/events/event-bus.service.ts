import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  DomainEventInput,
  EVENT_NAME_PATTERN,
} from './domain-event';

/**
 * Collects events during a unit of work (typically a Prisma transaction) and
 * emits them only when `flush()` is called — i.e. after commit. If the
 * transaction rolls back, the buffer is simply never flushed.
 *
 * Envelopes are built at `add()` time so `occurredAt` reflects when the fact
 * happened inside the transaction, not when it was published.
 */
export class DomainEventBuffer {
  private pending: DomainEvent<any>[] = [];

  constructor(private readonly bus: EventBusService) {}

  add<TData>(input: DomainEventInput<TData>): void {
    this.pending.push(this.bus.buildEnvelope(input));
  }

  get size(): number {
    return this.pending.length;
  }

  /** Emit everything collected, in order. Call only after the transaction committed. */
  flush(): void {
    const events = this.pending;
    this.pending = [];
    for (const event of events) this.bus.emitEnvelope(event);
  }

  /** Drop collected events without emitting (explicit rollback path). */
  discard(): void {
    this.pending = [];
  }
}

/**
 * In-process typed domain event bus (W0-E2-S1).
 *
 * - Names follow `noun.verb-past` (validated, throws early on typos).
 * - Every event is delivered as a DomainEvent envelope.
 * - Subscribe with @OnEvent('project.created') or @OnEvent('**') — the
 *   emitter runs in wildcard mode with '.' as the delimiter.
 * - Subscriber errors are caught and logged, never propagated to the
 *   publishing request.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly emitter: EventEmitter2) {}

  /** Emit immediately. For mutations inside a transaction use publishAfterCommit. */
  publish<TData>(input: DomainEventInput<TData>): DomainEvent<TData> {
    const envelope = this.buildEnvelope(input);
    this.emitEnvelope(envelope);
    return envelope;
  }

  /**
   * W4: emit and AWAIT async subscribers (workflow effects need their
   * side-effects — e.g. round creation — complete before the caller
   * continues, matching the ordering of the legacy synchronous calls).
   * Subscriber errors are still contained, never propagated.
   */
  async publishAndWait<TData>(input: DomainEventInput<TData>): Promise<DomainEvent<TData>> {
    const envelope = this.buildEnvelope(input);
    try {
      await this.emitter.emitAsync(envelope.event, envelope);
    } catch (err) {
      this.logger.error(
        `Subscriber error for awaited event ${envelope.event}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return envelope;
  }

  /**
   * Emit-after-commit helper. `work` receives a buffer to collect events
   * while it runs (typically inside `prisma.$transaction`); the buffer is
   * flushed only if `work` resolves. If it throws — Prisma has rolled the
   * transaction back — nothing is emitted and the error propagates.
   *
   *   await this.eventBus.publishAfterCommit(async (events) => {
   *     const result = await this.prisma.$transaction(async (tx) => {
   *       const project = await tx.project.create({ ... });
   *       events.add({ event: 'project.created', actor, subject: ..., data: ... });
   *       return project;
   *     });
   *     return result;
   *   });
   */
  async publishAfterCommit<T>(
    work: (events: DomainEventBuffer) => Promise<T>,
  ): Promise<T> {
    const buffer = this.createBuffer();
    try {
      const result = await work(buffer);
      buffer.flush();
      return result;
    } catch (err) {
      buffer.discard();
      throw err;
    }
  }

  /** For call sites that manage the transaction boundary themselves. */
  createBuffer(): DomainEventBuffer {
    return new DomainEventBuffer(this);
  }

  buildEnvelope<TData>(input: DomainEventInput<TData>): DomainEvent<TData> {
    if (!EVENT_NAME_PATTERN.test(input.event)) {
      throw new Error(
        `Invalid domain event name "${input.event}" — expected noun.verb-past (e.g. "project.created")`,
      );
    }
    return {
      event: input.event,
      version: input.version ?? 1,
      actor: input.actor,
      subject: input.subject,
      data: input.data,
      requestId: input.actor.requestId,
      occurredAt: new Date().toISOString(),
    };
  }

  emitEnvelope(envelope: DomainEvent<any>): void {
    try {
      this.emitter.emit(envelope.event, envelope);
    } catch (err) {
      // A broken subscriber must never break the request that emitted.
      this.logger.error(
        `Subscriber error while handling "${envelope.event}" (requestId=${envelope.requestId})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
