# 11 — Wave 0: Foundations

## Goals
Make every subsequent wave safe and observable: append-only audit, soft deletion, a domain event bus, actor attribution, and a regression suite that defines "nothing broke." No user-visible features.

## New tables / modules
- **`AuditLog`** (append-only: timestamp, actorUserId, actorOrgId, action, subjectType/subjectId, before/after JSON, requestId, ip). DB migration grants the app role INSERT/SELECT only on it (full enforcement Wave 8, but start honest).
- **`audit` module**: subscribes to all domain events, writes entries; admin read UI (administrator-only) with filters.
- **`events` infrastructure**: typed in-process domain event bus (NestJS event emitter is sufficient); conventions for event names (`noun.verb-past`), payload versioning.
- **`ActorContext`** type + request interceptor: `{ userId, referenceType, requestId, ip }` (extended with `activeOrgId` in Wave 1); threaded as first argument into mutating service methods.

## What changes in the existing system
- **D4 repair:** `deletedAt/deletedBy` columns added to domain tables (`blocks`, `projects`, `project_donations`, `project_studies`, sections, phases, tasks, budgets, expenses, milestones, users, admins, participants). Delete endpoints in `blocks`, `projects`, `study`, `execution`, `milestones` modules switch to soft delete; default queries exclude soft-deleted rows via a shared Prisma extension/middleware.
- `onDelete: Cascade` replaced with `Restrict` on domain relations (`Block→Project`, donations, studies, sections). Cascades may remain on pure-technical children (translations, refresh tokens).
- Mutating services in `projects`, `study`, `voting`, `donations`, `payments`, `execution`, `financial`, `milestones` emit domain events (`project.created`, `study.published`, `vote.cast`, `donation.approved`, `payment.completed`, `expense.approved`, …). This is mechanical and low-risk: emit-after-commit, no behavior change.
- **Regression suite** (the wave's first deliverable, written *before* the changes): end-to-end coverage of the frozen lifecycle from `01` — project→study→vote→approve→donate (QR + online-webhook simulated)→execute→close, plus auth/roles for the four seeded accounts. This suite is the backward-compatibility contract for all waves (`09`).

## Migration strategy
- All schema changes additive (columns) or constraint-only (cascade→restrict; verify no code path relied on cascades — the regression suite catches this).
- No backfills needed. Soft-delete middleware ships dark first (columns exist, delete endpoints still hard-delete behind a flag), flipped after a soak week.

## Risks
| Risk | Mitigation |
|---|---|
| A code path silently relied on cascade deletion | Regression suite written first; restrict violations surface as loud 500s in staging, not silent data loss |
| Soft-delete filter misses a query → deleted rows reappear | Centralize in one Prisma client extension; grep-audit raw queries; add a canary test that soft-deletes and checks every list endpoint |
| Event emission inside transactions causes double-fire on retry | Emit after commit only; audit writes idempotent on (requestId, action, subject) |
| "Invisible" wave gets deprioritized | DoD gate: Wave 1 cannot start (rule in `10`) |

## Dependencies
None. This is the root wave.

## Definition of done
- [ ] Regression suite green in CI, covering the full frozen lifecycle + seeded-account auth.
- [ ] Every mutating endpoint emits a domain event; audit UI shows a coherent trail for one complete project lifecycle run.
- [ ] All delete endpoints soft-delete; hard-delete flag removed; deleted rows invisible in every list/detail endpoint.
- [ ] No domain relation cascades remain (schema review).
- [ ] `ActorContext` present in all mutating service signatures; lint rule enforcing it on new code.
- [ ] Staging soak (1 week) with zero audit-gap or soft-delete-leak findings.
