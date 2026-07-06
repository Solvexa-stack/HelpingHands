# Backlog — Wave 0: Foundations
Source: [`../11_WAVE_0_FOUNDATIONS.md`](../11_WAVE_0_FOUNDATIONS.md)

---

## Epic W0-E1 — Regression test suite (the compatibility contract)
Built FIRST, before any Wave 0 change. Defines "nothing broke" for the whole program.

**S1 · M · qa,infra — E2E test harness**
Do: Stand up an e2e harness for `apps/api` (supertest or Nest testing app) with an isolated Postgres test DB, per-run `prisma migrate deploy` + seed, and factory helpers for the four seeded roles' JWTs.
AC: `pnpm test:e2e` runs green locally and in CI from a clean checkout; test DB fully reset between suites.
Deps: —

**S2 · L · qa — Frozen lifecycle spec: project → study → vote → approval**
Do: E2E spec covering project creation, study creation with sections from `StudyDepartmentTemplate`, section assignment/completion, publish, voting open (`StudyVote` for/against/abstain, one per user), voting close, approve and reject paths (asserting `StudyStatus` sequence at every step).
AC: Spec asserts status transitions, role restrictions (employee vs administrator), and rejection with reason; green.
Deps: S1

**S3 · M · qa — Donation flows spec (QR physical + online webhook)**
Do: E2E spec: participant pledges (`ProjectDonation` with `qrToken`), employee QR verify + approve → project progression recalculated; `OnlineDonation` via simulated Stripe/PayPal webhook payloads (through `WebhookLog` path) → completed status.
AC: Both channels asserted end-to-end incl. progression math and webhook dedupe (replayed event doesn't double-count).
Deps: S1

**S4 · M · qa — Execution & financial spec**
Do: E2E spec: phases → tasks (assignment, status flow), milestones, budget → expense approval, `ProjectTransaction` rows, progress recalculation, project closure (`isCompleted`).
AC: Full execution path asserted; progress numbers verified against expected formula.
Deps: S1

**S5 · S · qa — Auth & roles spec for seeded accounts**
Do: Spec asserting each seeded account's access matrix over representative endpoints (`@Public`, `@Roles` combinations), login, refresh-token flow, password reset request.
AC: Matrix documented in the spec; green.
Deps: S1

**S6 · S · infra — CI gate**
Do: Wire the suite as a required check on PRs to `main`; publish failure artifacts (logs, DB dump on failure).
AC: A PR breaking the lifecycle cannot merge.
Deps: S2–S5

---

## Epic W0-E2 — Domain event bus & ActorContext

**S1 · M · api — Event bus infrastructure**
Do: In-process typed event bus (Nest EventEmitter); event name convention `noun.verb-past`; payload envelope `{event, version, actor, subject, data, requestId, occurredAt}`; emit-after-commit helper.
AC: Unit-tested; a sample event emitted from a transaction only fires after commit (rollback test included).
Deps: —

**S2 · S · api — ActorContext interceptor**
Do: Request interceptor building `ActorContext {userId, referenceType, requestId, ip}` from JWT + request; injectable; threading convention documented.
AC: Available in all authed routes; requestId propagated to logs and event envelopes.
Deps: S1

**S3 · M · api — Event emission: projects, study, voting modules**
Do: Emit `project.created/updated/closed`, `study.created/published/approved/rejected`, `study_section.assigned/completed`, `vote.cast`, `voting.opened/closed` from the respective services (emit-after-commit; no behavior change).
AC: One full lifecycle run produces the complete expected event sequence (asserted by a new qa spec).
Deps: S1, S2

**S4 · M · api — Event emission: donations, payments, execution, financial, milestones**
Do: Emit `donation.pledged/approved/rejected`, `payment.completed/failed`, `phase.*`, `task.*`, `expense.submitted/approved`, `milestone.*`.
AC: Same as S3 for donation + execution paths.
Deps: S1, S2

**S5 · S · api — Lint rule: ActorContext on mutating services**
Do: ESLint rule (or convention check) requiring `ActorContext` as first param of new mutating service methods.
AC: CI fails on violation in changed files.
Deps: S2

---

## Epic W0-E3 — Audit log

**S1 · S · db — `AuditLog` table**
Do: Migration per `../03` §6 (append-only shape, indexes on subject, actor, timestamp).
AC: Migration applies cleanly; Prisma model in `packages/database`.
Deps: —

**S2 · M · api — `audit` module (event subscriber)**
Do: New module subscribing to all domain events; writes entries with before/after snapshots where the payload provides them; idempotent on `(requestId, action, subjectType, subjectId)`.
AC: Replayed event writes no duplicate; a full lifecycle run yields a coherent trail (qa spec).
Deps: W0-E2-S1..S4, S1

**S3 · M · admin-ui — Audit viewer**
Do: Administrator-only screen in `apps/admin`: filter by actor, subject, action, date range; detail view with snapshots.
AC: The lifecycle-run trail from S2 is fully explorable; non-administrators get 403.
Deps: S2

---

## Epic W0-E4 — Soft delete & cascade removal (D4)

**S1 · M · db,migration — `deletedAt/deletedBy` columns + cascade→restrict**
Do: Migration adding soft-delete columns to domain tables listed in the wave doc; change `onDelete: Cascade` → `Restrict` on domain relations (keep cascade on translations/refresh tokens); pre-check query confirming no code path depends on cascades (paired with regression suite).
AC: Migration applies; regression suite green (restrict violations would surface here).
Deps: W0-E1 complete

**S2 · M · api — Soft-delete Prisma extension**
Do: Central Prisma client extension: default-exclude soft-deleted rows on reads; convert `delete` calls to `update {deletedAt, deletedBy}` for domain models; explicit `includeDeleted` escape hatch (audit/admin use only).
AC: Unit tests per model class; grep-audit of raw queries documented.
Deps: S1

**S3 · M · api — Convert delete endpoints (flag-gated)**
Do: Delete endpoints in `blocks`, `projects`, `study`, `execution`, `milestones` modules soft-delete behind flag `SOFT_DELETE_ENFORCED`; emit `*.deleted` events.
AC: Flag ON: rows persist with `deletedAt`, vanish from every list/detail endpoint; flag OFF: legacy behavior; both modes covered by suite.
Deps: S2, W0-E2

**S4 · S · qa — Soft-delete canary spec**
Do: Spec that soft-deletes one of each entity type and walks every list/detail/report endpoint asserting invisibility.
AC: In the permanent suite; green with flag ON.
Deps: S3

---

## Epic W0-E5 — Rollout & wave close

**S1 · S · infra — Staging soak**
Do: Deploy with flags ON to staging for 1 week; monitor audit gaps, soft-delete leaks, event errors.
AC: Zero findings, or findings fixed and soak restarted.
Deps: all epics

**S2 · S · infra,docs — Production flip + DoD sign-off**
Do: Enable flags in production; walk the wave-doc DoD checklist; update `../PROGRESS.md` (Wave 0 ✅, D4 ✅).
AC: Every DoD box checked with evidence links.
Deps: S1
