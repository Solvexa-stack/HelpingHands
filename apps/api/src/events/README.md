# Domain events (W0-E2)

In-process typed event bus. Every mutation in the system will announce itself
here (stories S3/S4 wire the emissions); the audit log (W0-E3) and later
features subscribe instead of coupling to services.

## The envelope

Every event is delivered as a `DomainEvent`:

```ts
{
  event: 'project.created',   // noun.verb-past — validated, throws on typos
  version: 1,                 // payload schema version; bump when `data` changes shape
  actor: { userId, referenceType, requestId, ip },   // ActorContext
  subject: { type: 'project', id: 7 },
  data: { ... },              // event-specific payload
  requestId: '…',             // = actor.requestId, for correlation
  occurredAt: '2026-07-08T…', // when the fact happened (inside the tx)
}
```

`ActorContext` describes who acted. For work not driven by an authenticated
request (cron jobs, webhooks, seeds) use `systemActor()`. The request
interceptor that builds it from the JWT arrives in W0-E2-S2; Wave 1 extends
the type with `activeOrgId`.

## Emitting

**Rule: emit after commit, never inside an open transaction.** If the
transaction rolls back, the event must never have happened.

```ts
// Mutation inside a transaction — collect, flush on commit:
await this.eventBus.publishAfterCommit(async (events) => {
  return this.prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ ... });
    events.add({
      event: 'project.created',
      actor,
      subject: { type: 'project', id: project.id },
      data: { blockId: project.blockId, value: Number(project.value) },
    });
    return project;
  });
});

// Simple single-statement mutation (Prisma auto-commits it):
this.eventBus.publish({ event: 'vote.cast', actor, subject, data });
```

If `work` throws, the buffer is discarded — nothing is emitted — and the
error propagates unchanged.

## Subscribing

```ts
@OnEvent('project.created')          // one event
@OnEvent('project.*')                // all project events
@OnEvent('**')                       // everything (audit module)
handle(event: DomainEvent) { ... }
```

The emitter runs in wildcard mode with `.` as the delimiter. Subscriber
errors are caught and logged by the bus — they never fail the request that
emitted the event. Subscribers therefore must be idempotent and own their
retries.

## Testing

- Unit: `src/events/event-bus.service.spec.ts` (`pnpm test`)
- Commit/rollback proof over real Prisma transactions:
  `test/events.e2e-spec.ts` (`pnpm test:e2e`)
