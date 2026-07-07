# Domain events (W0-E2)

In-process typed event bus. Every mutation in the system announces itself
here; the audit log (W0-E3) and later features subscribe instead of coupling
to services.

## Live events (S3 — projects, study, voting)

| Event | Emitted from | Notes |
|---|---|---|
| `project.created` | `ProjectsService.create` | data: blockId, category, value |
| `project.updated` | `ProjectsService.update` | data: changedFields |
| `project.closed` | `ProjectsService.recalculateProgress` | on isCompleted false→true; actor via ALS (approver / anonymous webhook / system) |
| `study.created` | `StudyService.createStudy` | data: projectId, sections |
| `study.published` / `study.approved` / `study.rejected` | `StudyService.changeStatus` | rejected carries rejectionReason; draft/in_review moves are not announced |
| `voting.opened` / `voting.closed` | `StudyService.changeStatus` | opened carries votingStartsAt/EndsAt; re-opening (deadline extension) re-emits `voting.opened` |
| `voting.closed` (auto) | `VotingService.autoCloseExpiredVotings` | system actor, `data.auto: true`, one per closed study |
| `study_section.assigned` / `study_section.completed` | `StudyService.updateSection` | subject: study_section; data.studyId |
| `vote.cast` | `VotingService.castVote` | subject: study_vote; data: studyId, choice. `changeVote` is silent (not in the S3 list) |

Donations/payments/execution/financial/milestones follow in W0-E2-S4.

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

`ActorContext` describes who acted. Wave 1 extends the type with
`activeOrgId` — add fields, never repurpose them.

## ActorContext: how it is built and threaded (W0-E2-S2)

Request pipeline (all wired in `app.setup.ts` / `EventsModule`):

1. `requestContextMiddleware` (before guards) — resolves the `requestId`
   (inbound `X-Request-Id` honored, else generated), echoes it as the
   `X-Request-Id` response header, and opens the AsyncLocalStorage scope.
2. `JwtAuthGuard` validates the token and sets `request.user`.
3. `ActorContextInterceptor` (after guards) — builds the definitive actor
   from `request.user` (anonymous on `@Public` routes) and stores it on the
   request and in the ALS scope.

**Threading convention** (enforced by lint from W0-E2-S5):

- Controllers receive the actor with `@CurrentActor()` and pass it as the
  **first argument** of mutating service methods:

  ```ts
  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentActor() actor: ActorContext) {
    return this.projectsService.create(actor, dto);
  }
  ```

- Cross-cutting code (logging, event subscribers) that cannot take a
  parameter injects `ActorContextService` and calls `.current()` /
  `.currentOrSystem()`.
- Work with no request at all — cron jobs, queue processors, webhooks,
  seeds — uses `systemActor()` (fresh `requestId` per job run).

The `requestId` correlates everything: the `X-Request-Id` response header,
unhandled-error log lines (`HttpExceptionFilter`), and every event
envelope's `requestId` field.

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
