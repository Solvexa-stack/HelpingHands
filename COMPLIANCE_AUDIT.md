# Compliance Audit Report

Scope: static read-only audit of the repository at branch `workspaceandcenterbox`.
Stack established from `package.json:1-40`, `apps/api/package.json:1-60`, `packages/database/prisma/schema.prisma` (1782 lines, 28 migrations), 39 NestJS controllers, 39 e2e specs, 6 unit specs.

## 1. Executive Summary

| Area | Requirements | Met | Partial | Not met | Unverified |
|---|---|---|---|---|---|
| A — Transparency & Auditability | 3 | 0 | 1 | 2 | 0 |
| B — API-First architecture | 3 | 1 | 2 | 0 | 0 |
| C — Security & Data Integrity | 5 | 0 | 3 | 2 | 0 |
| D — Technical Sustainability | 2 | 0 | 2 | 0 | 0 |
| E — External layers | 2 | 0 | 0 | 0 | 0 (2 not applicable) |
| **Total** | **15** | **1** | **8** | **4** | **0** (+2 N/A) |

The platform has a genuinely well-engineered core: a double-entry ledger that is the sole writer of money facts (`apps/api/src/modules/treasury/treasury.service.ts:89-177`), a row-locked workflow engine with atomic guard re-checks (`apps/api/src/modules/workflow/workflow.service.ts:139-200`), four Prisma middlewares freezing legacy tables (`apps/api/src/prisma/prisma.service.ts:18-24`), and four custom ESLint rules enforcing architectural invariants (`apps/api/.eslintrc.cjs:13-16`). That engineering is real and above average.

It is undermined by three structural gaps. The audit log is written best-effort by an event subscriber that swallows its own failures (`apps/api/src/modules/audit/audit.service.ts:46-52`), and its only append-only protection is a `REVOKE` guarded by a database role that this repository never creates (`packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40`). Several financial write paths emit no event at all and therefore leave no audit row (`apps/api/src/modules/financial/financial.service.ts:72,92,104,164`). And the JWT signing secret falls back to a constant committed to this repository when the environment variable is absent (`apps/api/src/config/configuration.ts:15,17`), with no startup validation anywhere.

Verdict: not ready to hold real financial data without remediation of §2.

## 2. Top Three Risks

### Risk 1 — Hardcoded JWT fallback secret allows forging any identity

**Description.** `JWT_SECRET` and `JWT_REFRESH_SECRET` fall back to the literal strings `'fallback-secret'` and `'fallback-refresh-secret'`, committed to this repository. No startup validation rejects a missing secret.

**Evidence**
- `apps/api/src/config/configuration.ts:15` — `secret: process.env.JWT_SECRET || 'fallback-secret'`, the value used to sign access tokens.
- `apps/api/src/config/configuration.ts:17` — same pattern for the refresh secret.
- `apps/api/src/modules/auth/auth.module.ts:22` — `secret: config.get('jwt.secret')` feeds the fallback straight into `JwtModule`.
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts:18` — the same value verifies incoming tokens; a token signed with the fallback validates.
- Searched for env validation across `apps/api/src`: the only match for `JWT_SECRET` is `configuration.ts:15`. There is no `validationSchema`, Joi schema, or equivalent — `ConfigModule.forRoot` at `apps/api/src/app.module.ts:45-51` passes no validation option.
- `docker-compose.prod.yml:34` — the API container loads `env_file: .env`; if that file is missing the key, the container starts silently on the fallback rather than failing.

**Practical impact.** Anyone with the repository can mint a token with `{sub, referenceType:'admin', role:'administrator', tokenVersion:2}` and hold full administrator access, provided the environment variable is absent in the running deployment. The only thing standing between the public source and total compromise is an unvalidated, unmonitored environment variable. `apps/api/src/modules/auth/strategies/jwt.strategy.ts:24-30` does re-check the user exists and is active, so the forged `sub` must match a real user id — a trivial constraint.

**Proposed fix.** (1) Delete both `|| 'fallback-...'` defaults so `config.get('jwt.secret')` returns `undefined`. (2) Add a `validationSchema` to `ConfigModule.forRoot` in `apps/api/src/app.module.ts:45` requiring `JWT_SECRET` and `JWT_REFRESH_SECRET` with a minimum length, so the process refuses to boot without them.

### Risk 2 — The audit trail is neither guaranteed nor immutable

**Description.** Three independent failures compound: financial writes that emit no event, an audit writer that swallows its own errors, and append-only enforcement that is a no-op in every environment this repository configures.

**Evidence**
- `apps/api/src/modules/financial/financial.service.ts:72` (`createBudget`), `:92` (`updateBudget`), `:104` (`removeBudget`), `:164` (`updateExpense`) — all mutate financial rows and never call `this.eventBus`. Since audit rows are written only from domain events (`apps/api/src/modules/audit/audit.service.ts:23-45`), these four paths produce no audit record. The file acknowledges this with suppressions at `:66,:84,:99,:156`.
- `apps/api/src/modules/audit/audit.service.ts:46-52` — the `auditLog.create` failure path logs and returns; the mutation has already committed in a separate transaction.
- `apps/api/src/events/event-bus.service.ts:135-145` — `emitEnvelope` catches subscriber errors so "a broken subscriber must never break the request that emitted". Audit is therefore explicitly non-blocking.
- `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40` — the `REVOKE ... UPDATE, DELETE` is wrapped in `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helping_hands_app')`. Searching the whole repository for `helping_hands_app` returns only these three lines; the role is created nowhere.
- `docker-compose.prod.yml:38` and `docker-compose.yml:41` — the application connects as `postgres`, the cluster superuser, which bypasses table-level grants regardless.
- 35 `eslint-disable ... require-actor-context` suppressions across `apps/api/src` mark methods that mutate without a threaded actor.

**Practical impact.** A budget can be created, revalued, and deleted with no trace of who did it. Where audit rows do exist, nothing at the database level prevents an operator or a compromised application from issuing `UPDATE audit_logs SET ...` or `DELETE FROM audit_logs`. For a donation platform, an audit trail that can be silently edited is worse than none, because it is presented as authoritative at `apps/api/src/modules/audit/audit.controller.ts:15-25`.

**Proposed fix.** (1) Write the audit row inside the same Prisma transaction as the mutation (extend `EventBusService.publishAfterCommit` at `apps/api/src/events/event-bus.service.ts:99-111` into a transactional-outbox insert) so a failed audit rolls back the change. (2) Add a migration that creates a least-privilege `helping_hands_app` role with `SELECT, INSERT` only on `audit_logs`, plus a `BEFORE UPDATE OR DELETE` trigger that raises unconditionally, and point `DATABASE_URL` at that role instead of `postgres`.

### Risk 3 — Any authenticated user can read any donation, and any anonymous caller can read one by QR token

**Description.** `GET /api/v1/donations/:id` carries no `@Roles` and performs no ownership check; the tenancy assertion it relies on short-circuits for participants. The public token route returns the same PII to unauthenticated callers, and the tokens are generated with a non-cryptographic RNG.

**Evidence**
- `apps/api/src/modules/donations/donations.controller.ts:41-46` — `@Get(':id')` with only `@ApiBearerAuth`; no `@Roles`, no `@Public`, and the route is absent from `ROUTE_ACTION_MAP` (`apps/api/src/modules/policy/policy-registry.ts:265-390`).
- `apps/api/src/modules/policy/policy.service.ts:95-98` — with no `@Roles` metadata the guard passes `[]`, which `translateLegacy` maps to `{authenticatedOnly: true}`; `:52-54` then returns `allow: true` for any logged-in user.
- `apps/api/src/modules/donations/donations.service.ts:81-97` — `findById` checks only `tenancy.assertProjectVisible`; there is no comparison of `donation.participantId` against the caller.
- `apps/api/src/modules/policy/tenancy.repository.ts:94` — `assertProjectVisible` returns early when `actor.activeOrgId == null`.
- `apps/api/src/events/actor-context.ts:19` and `apps/api/src/modules/auth/auth.service.ts:326` — `activeOrgId` resolves from an `OrganizationMembership`; participants have none, so it is `null`. The assertion is therefore a no-op for every participant.
- `apps/api/src/modules/donations/donations.service.ts:89` — the response includes `participant.user.email`.
- Contrast `apps/api/src/modules/payments/payments.service.ts:204-206` — the parallel online-donation endpoint *does* enforce `donation.participantId !== user.referenceId`. The cash-donation path simply omits it.
- `apps/api/src/modules/donations/donations.controller.ts:49-53` — `@Public() @Get('token/:token')` returns the full donation including participant email (`apps/api/src/modules/donations/donations.service.ts:100-111`) with no authentication.
- `apps/api/src/modules/qr/qr.service.ts:12-15` — the 32-character token is built from `Math.random()`, not a CSPRNG.
- `apps/api/test/auth-matrix.e2e-spec.ts:77-80` confirms the "no `@Roles` → any logged-in identity" behaviour is the tested contract; no matrix row covers `GET /api/v1/donations/:id`.

**Practical impact.** A registered participant can enumerate donation ids and harvest every other donor's name, email, amount, and QR token. Because `Math.random()` in V8 is a recoverable-state xorshift128+, observing a handful of issued tokens makes further tokens predictable, and each predicted token yields donor PII from an unauthenticated endpoint.

**Proposed fix.** (1) In `donations.service.ts:81`, take the caller's `referenceType`/`referenceId` and reject when a participant requests a donation they do not own, mirroring `payments.service.ts:204-206`. (2) Replace `Math.random()` in `qr.service.ts:9-16` with `crypto.randomBytes(24).toString('base64url')`, and reduce the `@Public()` token response to the fields an employee needs to verify a payment (project, amount, status) with donor identity removed.

## 3. Detailed Audit

### A-1 — Immutable audit trail

**Verdict:** ❌ Not met

**Evidence**
- `apps/api/src/modules/audit/audit.service.ts:23-45` — `@OnEvent('**')` subscriber writes `who` (`actorUserId`), `what` (`action`, `subjectType`, `subjectId`), `before`/`after`, `when` (`timestamp`), plus `requestId` and `ip`. The four-field requirement is structurally satisfied where events fire.
- `packages/database/prisma/schema.prisma:976-995` — `AuditLog` model with a `@@unique([requestId, action, subjectType, subjectId])` idempotency key.
- `apps/api/src/events/events.module.ts:17-24` — `EventEmitterModule` configured with `wildcard: true, delimiter: '.'`, which is what makes the `'**'` subscription work; registered globally.
- `apps/api/src/app.module.ts:69` — `AuditModule` is imported at the entry point, and `apps/api/src/modules/audit/audit.module.ts:12` provides `AuditService`, so the subscriber is genuinely live, not merely defined.
- `apps/api/test/audit-trail.e2e-spec.ts:117,137-156` — 238 lines of e2e coverage asserting rows appear with snapshots.
- Audited paths do exist and are real: `apps/api/src/modules/donations/donations.service.ts:216` (`donation.approved`), `apps/api/src/modules/financial/financial.service.ts:201` (`expense.approved`), `apps/api/src/modules/treasury/treasury.service.ts:163` (`ledger.posted`).

**Bypasses found**
- `apps/api/src/modules/financial/financial.service.ts:72,92,104,164` — budget create/update/delete and expense update mutate financial data and emit nothing.
- `apps/api/src/modules/audit/audit.service.ts:46-52` — audit failures are swallowed; the mutation is already committed.
- `apps/api/src/events/event-bus.service.ts:135-145` — subscriber errors are caught by design, so audit can never block a write.
- `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40` — the append-only `REVOKE` is conditional on the role `helping_hands_app`, which is created nowhere in the repository; and `docker-compose.prod.yml:38` connects as superuser `postgres`, for which grants do not apply. Nothing prevents `UPDATE`/`DELETE` on `audit_logs`.
- `packages/database/prisma/seed.ts:12`, `packages/database/prisma/seed-demo.ts:9`, `packages/database/prisma/backfills/run-w1.ts:4` — raw `new PrismaClient()` outside the Nest application; no subscriber exists in those processes.
- `apps/api/src/modules/voting/voting.scheduler.ts:52-59` — the hourly cron updates `voteRound` and `projectStudy` with no event.
- Also examined and found clean: `apps/api/src/modules/treasury/treasury.service.ts` (every posting publishes `ledger.posted` at `:163`), `apps/api/src/modules/governance/governance.service.ts`, `apps/api/src/modules/organizations/organizations.service.ts:157`.

**Gap.** Audit coverage is per-call-site and voluntary, not enforced by the write layer; the audit table has no immutability protection in any environment this repository configures.

**Proposed fix.** Move the audit insert into the mutating transaction (outbox pattern), and add a migration creating a least-privilege role plus a `BEFORE UPDATE OR DELETE ON audit_logs` trigger that raises.

### A-2 — Document lifecycle with server-side enforcement

**Verdict:** ⚠️ Partial

**Evidence**
- `apps/api/src/modules/donations/donations.service.ts:178-183` — approved and cancelled donations are rejected server-side before any update.
- `apps/api/src/modules/donations/donations.service.ts:273-275` — only `pending` donations can be cancelled, and `:270-272` restricts cancellation to the owner.
- `apps/api/src/modules/financial/financial.service.ts:161` — approved expenses cannot be modified; `:217` — approved expenses cannot be deleted; `:183` — only pending expenses can be approved or rejected.
- `apps/api/src/modules/study/study.service.ts:650-651` — only `draft` studies are deletable.
- `apps/api/src/modules/org-reporting/org-reporting.service.ts:97-99,289` — explicit state-machine rejection of illegal report transitions.
- `apps/api/src/modules/workflow/workflow.service.ts:154-166` — the engine refuses an action with no matching transition from the current state and re-evaluates guards inside a `SELECT ... FOR UPDATE` row lock, so the check cannot be raced.
- `packages/database/prisma/schema.prisma:57-72` (`DonationStatus`, `StudyStatus`, `SectionStatus`), `:132` (`ExpenseStatus`), `:255` (`OrgReportStatus`) — states are modelled at the schema level, not invented in the UI.
- These are enforced in services, not components: `apps/web/src` and `apps/admin/src` contain no Prisma or database imports (searched for `@prisma/client`, `PrismaClient`, `helping-hands/database` — zero matches), so the UI cannot bypass them.

**Bypasses found**
- `apps/api/src/modules/financial/financial.service.ts:100-105` — `removeBudget` has no status guard whatsoever; it deletes the budget after only a not-found check.
- `packages/database/prisma/schema.prisma:855-880` — `ProjectBudget` has no status/state column at all, so no lifecycle can be enforced on it even in principle, despite carrying `approvedAmount` and an `actualAmount` accumulated from approved expenses (`apps/api/src/modules/financial/financial.service.ts:193-196`).
- No bypass found for donations or expenses after examining `donations.service.ts`, `financial.service.ts`, `study.service.ts` and `org-reporting.service.ts`.

**Gap.** Budgets — the object that authorises spending — are the one financial document with neither states nor post-approval protection.

**Proposed fix.** Add a `status` enum (`draft | approved | closed`) to `ProjectBudget` in `packages/database/prisma/schema.prisma:855` with a migration, and gate `updateBudget`/`removeBudget` in `financial.service.ts:85,100` on `status !== 'approved'`, matching the expense rules already at `:161,:217`.

### A-3 — Correction by reversing entry, no hard delete on financial records

**Verdict:** ❌ Not met

**Evidence**
- `apps/api/src/modules/treasury/treasury.service.ts:89-177` — `post()` only ever `create`s; there is no `update` or `delete` of `LedgerTransaction` or `LedgerEntry` anywhere in `apps/api/src` (searched all `.delete(`/`.deleteMany(` call sites — the ledger tables appear in none of them). The ledger itself is append-only in code.
- `apps/api/src/modules/treasury/treasury.service.ts:99-101` — postings must balance; `:102-104` — amounts must be positive; `:107-119` — idempotent replay on `(referenceType, referenceId, event)`.
- `apps/api/src/prisma/project-transaction-freeze.middleware.ts:20-30` — the legacy journal rejects `create/update/upsert` outside the treasury scope.
- `packages/database/prisma/schema.prisma:556,565-566,1502-1512` — financial relations use `onDelete: Restrict`, so a parent delete cannot cascade a donation away.
- `apps/api/src/modules/treasury/treasury.service.ts:44` states "corrections are reversing transactions".

**Bypasses found**
- No reversing-entry mechanism exists. Searching `apps/api/src` for `revers`/`Revers` returns only the comment at `treasury.service.ts:44`. There is no `reverse()` method and no `reversesTransactionId` column on `LedgerTransaction` (`packages/database/prisma/schema.prisma:1382-1400`). The nearest facility is `apps/api/src/modules/financial/financial.service.ts:265-299`, a generic manual entry typed `income|expense|adjustment|refund` with no link back to the entry it corrects. `apps/api/src/modules/treasury/treasury.service.ts:286-296` (`flagTransaction`) only emits an event; it changes no balance.
- Hard deletes reach financial and governance records: `apps/api/src/modules/financial/financial.service.ts:104` (`projectBudget.delete`), `:218` (`projectExpense.delete`), `apps/api/src/modules/study/study.service.ts:663-667` (`vote.deleteMany`, `voteRound.deleteMany`, `studyVote.deleteMany`), `apps/api/src/modules/projects/projects.service.ts:386-387` (`workflowStepLog.deleteMany`, `workflowInstance.delete`), `apps/api/src/modules/milestones/milestones.service.ts:91`.
- The soft-delete safety net is off by default and does not cover the relevant models: `apps/api/src/prisma/soft-delete.middleware.ts:47-49` reads `SOFT_DELETE_ENFORCED`, which `.env.example:23` sets to `false`; and `:26-44` (`SOFT_DELETE_MODELS`) omits `Vote`, `VoteRound`, `StudyVote`, `WorkflowInstance`, `WorkflowStepLog`, `LedgerTransaction`, `LedgerEntry`, `Expense`, `FundAllocation`, `FundDonation` and `ProjectTransaction` entirely — for those, the flag is irrelevant and deletion is always physical.
- `apps/api/src/prisma/project-transaction-freeze.middleware.ts:5` — "Creates/updates frozen; deletes stay possible". The financial journal is explicitly delete-permitted.
- `packages/database/package.json:10` — `db:reset` runs `prisma migrate reset --force`, dropping every table including `audit_logs`.

**Gap.** No reversing-entry facility exists, and physical deletion is reachable on budgets, expenses, votes and the workflow step log — the last of which is the lifecycle evidence trail.

**Proposed fix.** (1) Add `TreasuryService.reverse(actor, transactionId, reason)` that posts a mirror-image balanced transaction carrying a `reversesTransactionId` FK, and make it the only correction path. (2) Replace the `delete` calls at `financial.service.ts:104,218` and `study.service.ts:663-667` with status transitions, and add the affected models to `SOFT_DELETE_MODELS` with `SOFT_DELETE_ENFORCED=true` as the default.

### B-1 — Every UI operation available via API

**Verdict:** ✅ Met

**Evidence**
- Searched `apps/web/src`, `apps/admin/src`, `apps/web/package.json`, `apps/admin/package.json` for `@prisma/client`, `PrismaClient` and `helping-hands/database` — zero matches. Neither frontend can reach the database directly.
- Searched both frontends for Next.js `route.ts` and `actions.ts` files — none exist, so there is no server-side write path outside the API.
- `apps/admin/src/lib/api.ts` — 182 HTTP call sites; every admin mutation is an API call.
- `apps/web/src/lib/api.ts:55-175` — the public site's writes (`/auth/*`, `/donations`, `/voting/cast`, `/payments/checkout`, `/participants/:id`, `/notifications/*`) are all REST calls to the same API.
- `apps/api/src/main.ts:51-70` — Swagger document generated from the live decorator graph and served at `/api/docs`, so the surface is self-describing rather than hand-maintained.

**Bypasses found.** No UI-only operation found after examining both frontends' data-access layers (`apps/web/src/lib/api.ts`, `apps/admin/src/lib/api.ts`, `apps/admin/src/lib/workspace.ts`) and confirming the absence of route handlers and server actions.

**Gap.** None for this requirement. Note that the inverse also holds — the API exposes routes with no UI — which is not a defect here.

**Proposed fix.** None required.

### B-2 — Full data export in a standard format

**Verdict:** ⚠️ Partial

**Evidence**
- `apps/api/src/modules/transparency/exports.controller.ts:45,58,71` — three CSV endpoints: fund statement (public), project statement, organization summary.
- `apps/api/src/modules/transparency/csv.util.ts:1-10` — RFC-4180 quoting, UTF-8; `:11-30` provides a round-trip parser, so the format is tested rather than assumed.
- `apps/api/src/modules/reports/reports.controller.ts:15-60` — three PDF and three XLSX reports per project.
- `apps/api/src/modules/reports/reports.service.ts:268,319,353` — ExcelJS workbooks; `:56,153,222` — PDFKit documents.
- `apps/api/src/modules/audit/audit.controller.ts:15-19` — the audit trail is readable only as paginated JSON.

**Bypasses found.** Not applicable — this requirement is about presence, and the concern is coverage rather than circumvention.

**Gap.** Every export is scoped to a single project, fund, or organization. There is no full-database or full-tenant export: no bulk export of donations, donors (`apps/api/src/modules/donors/donors.controller.ts:22-46` offers no export route), expenses, the ledger, or the audit log. An organization leaving the platform, or an auditor wanting the complete record, has no path short of database access.

**Proposed fix.** Add a `GET /api/v1/exports/full` (administrator-scoped, and an org-scoped variant) streaming a ZIP of newline-delimited JSON or CSV per table — donations, ledger entries, expenses, allocations, decisions, audit log — reusing `toCsv` from `apps/api/src/modules/transparency/csv.util.ts:2`.

### B-3 — Webhooks or external-notification mechanism, documented

**Verdict:** ⚠️ Partial

**Evidence**
- Inbound webhooks exist and are signature-verified: `apps/api/src/modules/payments/webhooks.controller.ts:19-29` (Stripe, rejects a missing signature or raw body) and `:31-39` (PayPal).
- `apps/api/src/modules/payments/stripe.service.ts:55-57` — `constructEventAsync` with the configured webhook secret; a bad signature throws.
- `apps/api/src/modules/payments/paypal.service.ts:69-104` — server-side verification against PayPal's `verify-webhook-signature` endpoint; `apps/api/src/modules/payments/payments.service.ts:161-166` rejects with 403 and logs on failure.
- `packages/database/prisma/schema.prisma:960-974` — `WebhookLog` persists provider, event type, payload, processing time and error.
- `apps/api/src/main.ts:11-14` — `rawBody: true` is set at bootstrap, which is what makes Stripe signature verification possible; this is correctly wired, not merely declared.
- External notification: `apps/api/src/modules/email/email.service.ts` and `apps/api/src/modules/email/email.processor.ts` deliver SMTP mail through a Bull queue registered at `apps/api/src/app.module.ts:57-66`; `apps/api/src/modules/notifications/notifications.service.ts:16-22` queues in-app notifications with retry and exponential backoff.
- Documented: `apps/api/src/modules/payments/webhooks.controller.ts:14` carries `@ApiTags('Webhooks')`, so the routes appear in the Swagger document built at `apps/api/src/main.ts:67`.
- `apps/api/test/donations.e2e-spec.ts:395-401` asserts a failing PayPal verification returns 403 and is logged.

**Bypasses found.** No unverified webhook path found after examining `webhooks.controller.ts`, `payments.service.ts:150-190`, `stripe.service.ts` and `paypal.service.ts`. Both providers verify before any state change.

**Gap.** There is no *outbound* webhook mechanism — no way for an external system (a municipality's finance system, a donor's ERP) to subscribe to platform events. Searching `apps/api/src` for outbound HTTP (`fetch(`, `axios`, `http.request`) returns only `paypal.service.ts:76,86`, both calls into PayPal's own API. The rich domain-event bus at `apps/api/src/events/event-bus.service.ts:53-146` is in-process only. Separately, `apps/api/src/main.ts:56-64` enumerates tags for Auth/Languages/Blocks/Files/Projects/Donations/Participants/Admins/Dashboard but not Webhooks, Transparency, Audit, Treasury or Governance — those appear via `@ApiTags` but have no description in the document builder.

**Proposed fix.** Add an outbound subscription model (endpoint URL, event filter, HMAC secret) plus a subscriber on the existing `'**'` bus alongside `apps/api/src/modules/audit/audit.service.ts:23`, delivering through the Bull queue already configured at `apps/api/src/app.module.ts:57`, with signed payloads and retry.

### C-1 — Granular permissions, server-side, field-level

**Verdict:** ⚠️ Partial

**Evidence**
- Guards are registered at the entry point, not merely defined: `apps/api/src/modules/auth/auth.module.ts:33-37` provides `JwtAuthGuard`, `PolicyGuard` and `RolesGuard` as three `APP_GUARD` entries, and `apps/api/src/app.module.ts:72` imports `AuthModule`. `apps/api/src/events/events.module.ts:29` registers `ActorContextInterceptor` as `APP_INTERCEPTOR`, and `apps/api/src/app.setup.ts:13` registers the request-context middleware — used by both `main.ts:48` and the e2e harness, so tests exercise the real pipeline.
- Enumerating all 39 controllers with comments stripped, every route resolves to one of: `@Public()`, `@Roles(...)`, a `ROUTE_ACTION_MAP` entry, or the authenticated-only fallback. There is no route that escapes the guard chain.
- `apps/api/src/modules/policy/policy.service.ts:38-88` — ABAC evaluation over role grants along a project → organization → platform scope chain, with named conditions.
- `apps/api/src/modules/policy/policy-registry.ts:9-263` — semantic actions with segregation of duties, e.g. `allocation.propose` (fund director) is disjoint from `allocation.decide` (board), and `ledger.flag` is the only fund action a `fund_controller` holds besides `fund.read`.
- `apps/api/src/modules/policy/policy.guard.ts:186-212` — fund sub-resources are resolved back to their owning fund so a fund-scope grant cannot match a different fund; the comment documents this as a fix for exactly that leak.
- `apps/api/src/modules/policy/tenancy.repository.ts:59-88,91-120` — organization-level row scoping with an audited board bypass (`:155-163`).
- `apps/api/src/app.setup.ts:20-27` — `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` gives field-level control on *input*: unknown properties are rejected, not silently stripped.
- Field-level control on *output* exists on one surface only: `apps/api/src/modules/transparency/transparency.controller.ts:61-64,75-77` deletes `allocations`, `spendByCategory`, `moneyTrail` and `decisions` per publication policy, backed by `apps/api/src/modules/transparency/publication-policy.service.ts` and `packages/database/prisma/schema.prisma:1744-1755`.
- `apps/api/test/auth-matrix.e2e-spec.ts:68-123` — a 40-row access matrix across anon/participant/officer/employee/admin, executed against the real pipeline.

**Bypasses found**
- `apps/api/src/modules/donations/donations.controller.ts:41-46` + `apps/api/src/modules/donations/donations.service.ts:81-97` — no ownership check; `apps/api/src/modules/policy/tenancy.repository.ts:94` no-ops for participants because `activeOrgId` is null for them (`apps/api/src/events/actor-context.ts:19`, `apps/api/src/modules/auth/auth.service.ts:326`). Any authenticated participant reads any donation. See Risk 3.
- `apps/api/src/modules/files/files.controller.ts:91-99` + `apps/api/src/modules/files/files.service.ts:47-52` — `GET /api/v1/files?referenceId=&referenceType=` applies no scoping and no role restriction; any authenticated user enumerates file metadata for any entity, including organization verification documents and study attachments.
- Enforcement is flag-conditional. `apps/api/src/modules/policy/policy.guard.ts:11-13` — when `POLICY_ENFORCED !== 'true'`, `PolicyGuard` runs in shadow mode and always returns `true` (`:158`), leaving the coarser `RolesGuard` as the enforcer; conversely `apps/api/src/common/guards/roles.guard.ts:12` goes dormant when the flag is on. `.env.example:74` sets it to `true`, but nothing validates it at boot, so a missing variable silently downgrades authorization to role-only, losing all fund/organization scoping.
- Routes with no `@Roles` and no registry entry fall through to `apps/api/src/modules/policy/policy.service.ts:95-98,52-54` and allow any authenticated identity. For `auth/me`, `notifications/*`, `voting/*` and `payments/donations/:id/status` this is correct — those are scoped in their services (`notifications.service.ts:24-37,44-50`, `payments.service.ts:204-206`, `voting.service.ts:60-78`). For `donations/:id` and `files` it is not.

**Gap.** Object-level authorization is inconsistent — present on online donations, absent on cash donations and files. Field-level output control exists only on the public transparency surface; internal responses return whole Prisma objects with no per-field policy.

**Proposed fix.** (1) Add the missing ownership checks in `donations.service.ts:81` and scope `files.service.ts:47` to entities the caller can see. (2) Add `POLICY_ENFORCED` and `TENANCY_ENFORCED` to a boot-time validation schema on `ConfigModule.forRoot` (`apps/api/src/app.module.ts:45`) so the enforcing configuration cannot be lost by omission.

### C-2 — Backdoor prevention (writes bypassing the audit layer)

**Verdict:** ❌ Not met

**Evidence of the intended controls**
- `apps/api/src/prisma/prisma.service.ts:18-24` — four middlewares registered on the shared client: soft-delete, study-vote freeze, `ProjectTransaction` freeze, category-enum freeze.
- `apps/api/.eslintrc.cjs:13-16` — four custom rules enforced as errors: `require-actor-context`, `no-unscoped-org-reads`, `no-direct-status-writes`, `treasury-only-ledger-writes`.
- `apps/api/src/prisma/legacy-journal.ts:11-17` — an `AsyncLocalStorage` capability scope so only the treasury dual-write may append legacy journal rows.

**Bypasses found**
- **Seeds and backfills (highest impact).** `packages/database/prisma/seed.ts:12`, `packages/database/prisma/seed-demo.ts:9`, `packages/database/prisma/backfills/run-w1.ts:4` instantiate `new PrismaClient()` directly. That client has none of the four middlewares from `prisma.service.ts:18-24`, and these are standalone `ts-node` processes with no Nest container, so `AuditService` (`apps/api/src/modules/audit/audit.service.ts:23`) does not exist to subscribe. `packages/database/prisma/backfills/w5-treasury-backfill.ts:108` creates `LedgerTransaction` rows directly, bypassing `TreasuryService` — which `apps/api/src/modules/treasury/treasury.service.ts:42` declares the "SOLE writer of ledger tables" — and bypassing the `treasury-only-ledger-writes` rule, whose allowlist logic only applies to files under `src` (`apps/api/eslint-rules/no-direct-status-writes.js:23` shows the same `/[/\\]src[/\\]/` gating convention). `packages/database/package.json:12` exposes this as `db:seed:demo`.
- **Destructive script.** `packages/database/package.json:10` — `db:reset` = `prisma migrate reset --force`, which drops and recreates every table, `audit_logs` included, with no confirmation.
- **Scheduled job.** `apps/api/src/modules/voting/voting.scheduler.ts:52-59` — the `@Cron('0 * * * *')` handler updates `voteRound.reminderSentAt` and `projectStudy.reminderSentAt` with no `ActorContext` and no domain event.
- **Unaudited service writes.** `apps/api/src/modules/financial/financial.service.ts:72,92,104,164`; `apps/api/src/modules/files/files.service.ts:28,34,71,78,83,88`; `apps/api/src/modules/languages/languages.service.ts:26,32,38,44`; `apps/api/src/modules/participants/participants.service.ts:112,124,133`; `apps/api/src/modules/notifications/notifications.service.ts:48,55,83`. None of these five services injects `EventBusService`, so none can produce an audit row.
- **No database-level backstop.** As in A-1: the `helping_hands_app` role referenced by `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:35` is never created, and `docker-compose.prod.yml:38` connects as superuser `postgres`. Anyone with `DATABASE_URL` — which every container receives — has unrestricted DDL and DML on every table.
- **Suppressions.** 35 `eslint-disable ... require-actor-context` comments across `apps/api/src`, including five in `financial.service.ts` alone (`:66,84,99,156,212,264`).

**Examined and found clean**
- Raw SQL: only two sites in `apps/api/src`. `apps/api/src/modules/workflow/workflow.service.ts:143` is a parameterized tagged-template `SELECT ... FOR UPDATE` (read-only, inside the engine's own transaction). `apps/api/src/modules/projects/fk-consistency.service.ts:53` is `$queryRawUnsafe`, but interpolates only values from the module-local `D1_TABLES` constant (`:7`) — no user input — and is a read-only `SELECT count(*)`. Neither is a write bypass and neither is injectable.
- Migrations: reviewed all 28 under `packages/database/prisma/migrations/`; the only data-affecting one is `20260708170254_backfill_project_owner_org_not_null`, a schema-constraint backfill, not an ongoing write path.
- `.github/workflows/deploy.yml:118-127` runs `prisma migrate deploy` only, with an explicit comment forbidding seeding in production. The CD pipeline itself is not a backdoor.
- No admin "impersonate" or "run as" endpoint found across all 39 controllers.

**Gap.** Three categories of writer — standalone scripts, the cron scheduler, and five services — reach financial and identity tables with no audit record and, for the scripts, with every integrity middleware disabled. Because the database user is a superuser, there is no layer below the application that could catch any of it.

**Proposed fix.** (1) Export the configured client from `packages/database` (middlewares attached) and require seeds and backfills to import it, with an audit-writing hook for script actors. (2) Create a least-privilege application role in a migration and switch `DATABASE_URL` to it in `docker-compose.prod.yml:38`, reserving superuser credentials for migrations only.

### C-3 — Secrets and credentials in source

**Verdict:** ❌ Not met

**Evidence** (locations only; values not reproduced)
- `apps/api/src/config/configuration.ts:15` — hardcoded fallback JWT signing secret, committed. `:17` — hardcoded fallback refresh secret. See Risk 1.
- No environment validation exists: `apps/api/src/app.module.ts:45-51` calls `ConfigModule.forRoot` with `isGlobal`, `load` and `envFilePath` but no `validationSchema`; searching `apps/api/src` for `validationSchema`/`Joi` returns nothing.
- `packages/database/prisma/seed.ts:44,66,88,110` — four hardcoded account passwords for administrator, employee, financial officer and participant. The same credentials are published in `README.md:63-68` and `CLAUDE.md` and the seed is production-runnable via `packages/database/package.json:11`.
- `docker-compose.yml:8` — literal Postgres superuser password in the development compose file; `:41` repeats it inside `DATABASE_URL`; `:11-12` publishes port 5432 on all interfaces.
- `apps/api/src/config/configuration.ts:21` — SMTP host defaults to a live third-party host rather than failing closed.

**Bypasses found.** Not applicable to this requirement. Verified the negative case: `.gitignore:7-13` excludes `.env`, `.env.local`, `apps/**/.env` and `packages/**/.env`, and `git ls-files` confirms the only tracked env file is `.env.example`. `.env.example` contains placeholders only (`:26,28,40,52-58`). The local `.env`, `apps/web/.env`, `apps/admin/.env` and `packages/database/.env` exist on disk but are untracked. No live API key, token, or production credential was found committed.

**Gap.** The dangerous items are not leaked production secrets but committed *fallback* secrets that activate silently on misconfiguration, plus published default credentials for a seed that runs against production.

**Proposed fix.** (1) Remove both fallbacks at `configuration.ts:15,17` and add a boot-time validation schema requiring them. (2) Change `packages/database/prisma/seed.ts:44,66,88,110` to read passwords from environment variables and refuse to run when `NODE_ENV === 'production'`.

### C-4 — Environment isolation and backups

**Verdict:** ⚠️ Partial

**Evidence — isolation (present)**
- `docker-compose.yml:36-40` builds from source targeting the `dev` stage with hot-reload bind mounts (`:57-70`); `docker-compose.prod.yml:32` pulls immutable registry images by tag. The two are genuinely different topologies, not one file with variables.
- `docker-compose.prod.yml:12,26,37,60,80` bind every published port to `127.0.0.1`, so Postgres, Redis and all three apps are reachable only through the reverse proxy; `docker-compose.yml:11,29,44` publish on all interfaces for local work.
- `deploy/nginx/api.conf`, `deploy/nginx/web.conf`, `deploy/nginx/admin.conf` — separate vhosts per app.
- `.github/workflows/deploy.yml:9-12,84-90` — single-branch trigger with a `concurrency` group preventing overlapping production deploys; `:118-127` runs migrations only, with an explicit comment forbidding seeding.
- `.env.example:16-17` and `apps/api/test/global-setup.ts` — e2e tests target a dedicated `helping_hands_test` database, never the development one.
- `apps/api/src/app.module.ts:45-51` loads `.env.local` before `.env` before `../../.env`, giving per-environment override precedence.

**Bypasses found — backups (absent)**
- Searched the entire repository (excluding `node_modules` and `.git`) across `.yml`, `.yaml`, `.sh`, `.ts` and `.conf` for `backup`, `pg_dump`, `restore` and `snapshot`. Zero operational matches: every hit is unrelated (e.g. `audit.controller.ts:22` "snapshots", test files "restore").
- Neither `docker-compose.yml:118-120` nor `docker-compose.prod.yml:98-100` defines any backup service, sidecar, or scheduled task. The `pgdata` and `uploads` volumes have no export mechanism.
- `scripts/` contains exactly one file, `check-i18n-keys.mjs` — no operational scripting at all.
- `.github/workflows/deploy.yml` has no backup step before running `prisma migrate deploy` on production.
- The project documents this honestly: `quide for project/BACKUP_RECOVERY.md:4` states backups are "not automated anywhere in this repository", and `:33` repeats that no cron job or managed-backup configuration exists. That is a document, not an implementation, and per this audit's separation of code from docs, it does not satisfy the requirement.

**Gap.** Environments are properly separated. Backups do not exist in code or configuration — only manual `pg_dump` instructions in prose. A production migration runs with no pre-migration snapshot.

**Proposed fix.** (1) Add a backup service to `docker-compose.prod.yml` (a `postgres:16-alpine` sidecar running scheduled `pg_dump` to an off-host target, plus `uploads` volume sync) with documented retention. (2) Insert a `pg_dump` step into `.github/workflows/deploy.yml` immediately before the `prisma migrate deploy` call at `:118`.

### C-5 — Beneficiary data protection in public output and exports

**Verdict:** ⚠️ Partial

**Evidence — the public transparency layer is genuinely clean**
- `apps/api/src/modules/transparency/transparency-read.service.ts:33-36` declares a query-level hard exclusion. Verified field by field against the actual selects: `:69,137,148,164-165,238-239,257,369,377,391,395,409-410,461,502,510,513` select only ids, project/fund/organization/category names, translations, amounts and statuses. No `email`, no participant or donor name, no user record is selected anywhere in the file.
- `apps/api/src/modules/transparency/transparency.controller.ts:33-37` gates every public section on publication policy, and `:61-64,75-77` strips closed field classes from the response before it leaves.
- Public fund statement CSV — `apps/api/src/modules/transparency/exports.controller.ts:45-56` — emits `date, description, direction, amount, running_balance` (`:110-115`). Checked every producer of `description`: `apps/api/src/modules/treasury/money-events.subscriber.ts:42,55,92,102,121,150,190,219,273,307` and `apps/api/src/modules/funds/funds.service.ts:404` use numeric ids only; `apps/api/src/modules/payments/payments.service.ts:117` uses the project name. No donor identity can reach the public CSV.
- `apps/api/src/modules/transparency/transparency.controller.ts:104-110` — the board decision registry is documented and implemented as "no member identities".
- `apps/api/src/modules/voting/voting.controller.ts:49-51` — public vote results are anonymized.
- `apps/api/test/auth-matrix.e2e-spec.ts:479` — a regression test asserts participants cannot read unpublished study detail.

**Bypasses found**
- `apps/api/src/modules/donations/donations.controller.ts:49-53` — `@Public() GET /api/v1/donations/token/:token` returns the full donation graph including `participant.user.email` and the participant's first and last name (`apps/api/src/modules/donations/donations.service.ts:100-111`) to a completely unauthenticated caller. The only secret is the token, generated by `apps/api/src/modules/qr/qr.service.ts:12-15` from `Math.random()` rather than a CSPRNG.
- `apps/api/src/modules/donations/donations.controller.ts:41-46` — the same PII reachable by any authenticated participant for any donation id (Risk 3).
- No masking function exists anywhere. Searched `apps/api/src` for `mask`, `anonym`, `redact` — the only matches are the transparency-layer comments cited above, which describe exclusion-by-non-selection, not masking.
- Internal exports, inspected field by field: `apps/api/src/modules/reports/reports.service.ts:320-338` (`generateDonationsExcel`) emits `Participant` full name and `Email` in clear. This is role-gated to administrator and financial officer (`apps/api/src/modules/reports/reports.controller.ts:12-13` class-level `@Roles`), which is defensible for an internal report, but the spreadsheet leaves the platform with no marking, no masking, and no record that it was generated — `reports.service.ts` does not inject `EventBusService`, so no audit row records the extraction.
- `apps/api/src/modules/transparency/exports.controller.ts:71-98` (org summary CSV) — checked field by field: project id, name, category, target, collected, progression, completed. No PII. Clean.

**Gap.** The public transparency surface is well protected. The donation-by-token and donation-by-id endpoints are not, and no masking primitive exists for any export. PII-bearing exports are not audited.

**Proposed fix.** (1) Reduce the `@Public()` token response in `donations.service.ts:99-115` to project, amount, status and reference only, and move any donor detail behind employee authentication. (2) Emit a `report.exported` domain event from `apps/api/src/modules/reports/reports.service.ts:310` so PII extractions appear in the audit trail.

### D-1 — License and dependence on closed services

**Verdict:** ⚠️ Partial

**Evidence**
- `README.md:158` states "MIT". No `LICENSE` file exists at the repository root (checked `LICENSE*` — absent), and no `license` field appears in `package.json`, `apps/api/package.json`, `apps/web/package.json`, `apps/admin/package.json` or `packages/database/package.json` (searched all five — zero matches). The licence is a prose claim with no machine-readable or legally operative artifact.
- Closed-service dependencies are few and well isolated. Stripe: `apps/api/src/modules/payments/stripe.service.ts` (86 lines); PayPal: `apps/api/src/modules/payments/paypal.service.ts` (105 lines). Both sit behind `apps/api/src/modules/payments/payments.service.ts`, which dispatches by provider, and `packages/database/prisma/schema.prisma:89-93` models `PaymentProvider` as an enum — adding or replacing a provider is a contained change.
- The core stack is open and self-hostable: PostgreSQL and Redis (`docker-compose.prod.yml:2,20`), Prisma, NestJS, Next.js. `apps/api/src/modules/treasury/treasury.service.ts` holds the money model in the platform's own ledger, not in a payment provider — so provider replacement does not threaten the financial record.
- Email is generic SMTP via Nodemailer (`apps/api/package.json:44`), not a proprietary API.
- Registry lock-in is mild and deployment-only: `.github/workflows/deploy.yml:19` pins `ghcr.io/solvexa-stack/helpinghands`, mirrored in `.env.example:99`.
- No proprietary database, no BaaS, no closed authentication provider found across `apps/api/package.json`, `apps/web/package.json` and `apps/admin/package.json`.

**Bypasses found.** Not applicable to this requirement.

**Gap.** The declared licence has no `LICENSE` file or `package.json` field, so the terms are legally ambiguous — a real obstacle for a public-sector or NGO adopter performing procurement review.

**Proposed fix.** Add a root `LICENSE` file with the full MIT text and set `"license": "MIT"` in `package.json:2`.

### D-2 — Tests, migrations, and documentation for a new developer

**Verdict:** ⚠️ Partial

**Evidence — migrations (strong)**
- 28 ordered, timestamped migrations under `packages/database/prisma/migrations/`, from `20260606121621_init` through `20260711213004_w9_stabilization_...`, with `migration_lock.toml` present. Names are semantic and traceable to the roadmap waves.
- Data backfills are separated from schema migrations under `packages/database/prisma/backfills/` (six files), which is the right structural choice.
- `.github/workflows/deploy.yml:118-122` applies them with `prisma migrate deploy` on every production release.

**Evidence — tests (strong on the API, absent elsewhere)**
- 39 e2e specs under `apps/api/test/`, covering the sensitive areas specifically: `audit-trail.e2e-spec.ts` (238 lines), `auth-matrix.e2e-spec.ts` (a 40-row role matrix at `:68-123` plus JWT lifecycle at `:218-266` and ownership gaps at `:415-500`), `w2-tenancy-isolation` and `w2-tenancy-leak`, `w5-treasury`, `w5-funds`, `w7-transparency`, `soft-delete-canary`, `policy-shadow`.
- 6 unit specs in `apps/api/src`, including `apps/api/src/modules/policy/policy.service.spec.ts` and `apps/api/src/events/require-actor-context.rule.spec.ts` (the lint rule is itself tested).
- Tests run the real request pipeline: `apps/api/src/app.setup.ts:6-10` documents that `configureApp` is shared between `main.ts` and the e2e harness, so guards and pipes under test are the deployed ones.

**Evidence — documentation (extensive)**
- `README.md` (quick start, endpoints, role matrix), `CLAUDE.md`, `docs/` (13 files: architecture, database, API, frontend, admin, docker, production, CI), `docs/docker/` (4 files), `quide for project/` (10 files including `SYSTEM_ARCHITECTURE.md`, `BUSINESS_FLOW.md`, `BACKUP_RECOVERY.md`), `workspaceroadmap/` (21 files plus a 12-file backlog), `helpinghands-roadmap/` (11 files).

**Bypasses found.** Not applicable to this requirement.

**Gap.**
- Zero frontend tests. Searched `apps/web` and `apps/admin` for `*.test.*` and `*.spec.*` — no matches. Neither `apps/web/package.json` nor `apps/admin/package.json` defines a test script, yet `package.json:20` runs `turbo test` across the workspace, and `apps/api/package.json:12` passes `--passWithNoTests`, so `pnpm test` reports success while covering no UI code at all.
- No coverage threshold is configured; `apps/api/package.json:63-79` sets up Jest with no `coverageThreshold`, so `test:coverage` measures without enforcing.
- Documentation quality is uneven: `README.md:8` contains the stray string `dfdfsfdsf`, and the roadmap directories partly contradict each other on wave status. A new developer faces roughly 60 markdown files across four directories with no index indicating which are current.
- `README.md:63-68` instructs new developers to seed accounts whose passwords are published in the same file (see C-3).

**Proposed fix.** (1) Add component tests for the admin dashboard's financial and audit screens, and drop `--passWithNoTests` from `apps/api/package.json:12` so an empty suite fails. (2) Add a `docs/README.md` index marking each document current or historical, and remove the stray text at `README.md:8`.

### E-1 — Public sync is one-directional

**Verdict:** ➖ Not applicable

**Reasoning.** This requirement is auditable only if the code claims a synchronized public platform. It does not. There is one database and one API; the public site is a client of the same API, not a synced replica.

**Evidence**
- `apps/api/src/modules/transparency/transparency-read.service.ts:29-32` describes the transparency module as "cached aggregates" that serve "BOTH the public portal and the internal dashboards (one source — public numbers can never disagree with internal ones). No new domain truth; reads only." That is a shared-read-layer design, explicitly not a sync.
- `apps/api/src/modules/transparency/transparency-refresh.subscriber.ts:15-33` — the "refresh" is in-process cache invalidation on domain events (`readService.invalidate()` at `:32`), not data transfer to another system.
- `apps/api/src/modules/transparency/transparency-read.service.ts:44-47` — the cache is a `Map` in application memory with a 60-second TTL. No second datastore exists.
- The public web app is read-write against the same API: `apps/web/src/lib/api.ts:97` (create donation), `:99` (cancel), `:147,149` (cast/change vote), `:159` (payment checkout), `:131` (update participant), `:173,175` (notifications). So if `apps/web` is taken to be "the public platform", the flow is bidirectional by design, and one-directionality is not a property the system claims or attempts.

**Gap.** None to report — there is no sync mechanism whose directionality could be violated. Should a genuinely separate public mirror be introduced later, this requirement becomes auditable.

**Proposed fix.** None applicable. If a separate public deployment is planned, the existing read-layer boundary at `transparency-read.service.ts` is the correct seam to build it on.

### E-2 — International XML export conforming to a schema

**Verdict:** ➖ Not applicable

**Reasoning.** No XML export exists, and the code makes no claim to one.

**Evidence**
- Searched `apps/api/src`, `apps/web/src` and `apps/admin/src` for `xml`, `xsd`, `IATI`, `SEPA` and `XBRL`. The only matches are XLSX and DOCX MIME type strings: `apps/api/src/modules/reports/reports.controller.ts:43,51,59` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) and `apps/api/src/modules/expenses/invoices.controller.ts:21`. These are OOXML content-type identifiers, not an XML export feature.
- No XML serializer is present in `apps/api/package.json:16-58`; the export libraries are `exceljs` (`:31`) and `pdfkit` (`:47`).
- Searched `workspaceroadmap/`, `quide for project/`, `docs/`, `helpinghands-roadmap/` and `README.md` for the same terms — no roadmap item, backlog entry, or specification proposes an international XML export.
- The export surface that does exist is CSV, XLSX and PDF only (`apps/api/src/modules/transparency/exports.controller.ts:45,58,71`; `apps/api/src/modules/reports/reports.controller.ts:15-60`).

**Gap.** None to report against a claim, since none is made. If cross-border reporting is a future requirement, no groundwork exists today.

**Proposed fix.** None applicable.

## 4. Full Coverage Table

| Requirement | Verdict | Key evidence |
|---|---|---|
| A-1 Immutable audit trail | ❌ Not met | `apps/api/src/modules/audit/audit.service.ts:23-52` (subscriber writes who/what/before/after/when, but swallows failures); `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40` (append-only REVOKE gated on a role never created); `apps/api/src/modules/financial/financial.service.ts:72,92,104,164` (financial writes emitting no event) |
| A-2 Document lifecycle | ⚠️ Partial | `apps/api/src/modules/donations/donations.service.ts:178-183`, `apps/api/src/modules/financial/financial.service.ts:161,217` (server-side post-approval locks); `apps/api/src/modules/workflow/workflow.service.ts:154-166` (row-locked guard re-check); gap: `financial.service.ts:100-105` + `packages/database/prisma/schema.prisma:855-880` (budgets have no state and no delete guard) |
| A-3 Reversing entry, no hard delete | ❌ Not met | `apps/api/src/modules/treasury/treasury.service.ts:89-177` (ledger append-only in code); no `reverse()` exists — only the comment at `:44`; hard deletes at `financial.service.ts:104,218`, `study.service.ts:663-667`, `projects.service.ts:386-387`; `apps/api/src/prisma/soft-delete.middleware.ts:26-44,47-49` (models omitted, flag off by default) |
| B-1 UI operations available via API | ✅ Met | No Prisma/DB import in `apps/web/src` or `apps/admin/src`; no route handlers or server actions; `apps/admin/src/lib/api.ts` (182 API calls); `apps/api/src/main.ts:51-70` (Swagger) |
| B-2 Full data export | ⚠️ Partial | `apps/api/src/modules/transparency/exports.controller.ts:45,58,71` (CSV); `apps/api/src/modules/reports/reports.service.ts:268,319,353` (XLSX/PDF); gap: no bulk export of donations, donors, ledger or audit log |
| B-3 Webhooks / external notification | ⚠️ Partial | Inbound verified: `apps/api/src/modules/payments/webhooks.controller.ts:19-39`, `stripe.service.ts:55-57`, `paypal.service.ts:69-104`, `apps/api/src/main.ts:11-14` (rawBody); documented via `@ApiTags` at `webhooks.controller.ts:14`; gap: no outbound webhooks — only PayPal calls at `paypal.service.ts:76,86` |
| C-1 Granular server-side permissions | ⚠️ Partial | `apps/api/src/modules/auth/auth.module.ts:33-37` (three APP_GUARDs registered at the entry point); `apps/api/src/modules/policy/policy-registry.ts:9-263` (segregation of duties); gap: `apps/api/src/modules/donations/donations.controller.ts:41` + `donations.service.ts:81-97` and `apps/api/src/modules/files/files.controller.ts:91` + `files.service.ts:47-52` (no object-level check); `apps/api/src/modules/policy/policy.guard.ts:11-13` (enforcement is flag-conditional) |
| C-2 Backdoor prevention | ❌ Not met | `packages/database/prisma/seed.ts:12`, `seed-demo.ts:9`, `backfills/run-w1.ts:4` (raw PrismaClient — no middleware, no audit); `backfills/w5-treasury-backfill.ts:108` (direct ledger writes bypassing `treasury.service.ts:42`); `apps/api/src/modules/voting/voting.scheduler.ts:52-59` (unaudited cron writes); `docker-compose.prod.yml:38` (superuser connection, no DB-level backstop) |
| C-3 Secrets and credentials | ❌ Not met | `apps/api/src/config/configuration.ts:15,17` (committed fallback JWT secrets, no boot validation at `app.module.ts:45-51`); `packages/database/prisma/seed.ts:44,66,88,110` (hardcoded passwords, published at `README.md:63-68`); `docker-compose.yml:8,41`; verified clean: `.gitignore:7-13` and `git ls-files` (no `.env` tracked) |
| C-4 Isolation and backups | ⚠️ Partial | Isolation present: `docker-compose.prod.yml:12,26,37,60,80` (loopback-bound) vs `docker-compose.yml:11,29,44`; `.github/workflows/deploy.yml:9-12`; `.env.example:16-17` (separate test DB); backups absent: no `pg_dump`/backup service anywhere in code or config; only prose at `quide for project/BACKUP_RECOVERY.md:4,33` |
| C-5 Beneficiary data protection | ⚠️ Partial | Clean: `apps/api/src/modules/transparency/transparency-read.service.ts:33-36` and every select in the file; public CSV descriptions carry ids only (`money-events.subscriber.ts:42-307`); gap: `apps/api/src/modules/donations/donations.controller.ts:49-53` + `donations.service.ts:100-111` (unauthenticated PII) with `qr.service.ts:12-15` (`Math.random()` tokens); `reports.service.ts:320-338` (unaudited PII export) |
| D-1 License and closed services | ⚠️ Partial | `README.md:158` claims MIT but no `LICENSE` file and no `license` field in any of the five `package.json` files; closed services isolated to `stripe.service.ts` and `paypal.service.ts` behind `payments.service.ts` and the `PaymentProvider` enum (`packages/database/prisma/schema.prisma:89-93`) |
| D-2 Tests, migrations, documentation | ⚠️ Partial | 28 ordered migrations + `migration_lock.toml`; 39 e2e specs incl. `apps/api/test/auth-matrix.e2e-spec.ts:68-123` and `audit-trail.e2e-spec.ts`; 6 unit specs; ~60 docs; gap: zero tests in `apps/web`/`apps/admin`, `--passWithNoTests` at `apps/api/package.json:12`, no coverage threshold, stray text at `README.md:8` |
| E-1 Public sync one-directional | ➖ Not applicable | No sync exists: `apps/api/src/modules/transparency/transparency-read.service.ts:29-32,44-47` (shared read layer, in-memory cache, one database); `apps/web/src/lib/api.ts:97,147,159` (public site writes to the same API by design) |
| E-2 International XML export | ➖ Not applicable | No XML anywhere in `apps/api/src`, `apps/web/src`, `apps/admin/src`; only OOXML MIME strings at `apps/api/src/modules/reports/reports.controller.ts:43,51,59`; no roadmap or doc claims the feature |

## 5. Limits of This Audit

- **Static reading only.** No code was executed, no application was started, no test suite was run, and no request was issued against a running instance. Every finding is derived from reading source. Behavioural claims (for example, that `GET /api/v1/donations/:id` returns another participant's record) are traced through the call chain — controller, guard, service, tenancy assertion, JWT payload construction — but not empirically confirmed at runtime.
- **Runtime environment not inspected.** The deployed VPS referenced by `.github/workflows/deploy.yml:96-100` was not examined. Whether `JWT_SECRET`, `POLICY_ENFORCED` and `TENANCY_ENFORCED` are actually set in the production `.env` loaded by `docker-compose.prod.yml:34` cannot be determined from this repository. The C-1 and C-3 findings describe what happens when they are absent, which the code permits silently; they are not assertions about the current production state.
- **Live database not inspected.** Whether a `helping_hands_app` role, triggers, or grants exist on the running cluster is unverifiable from here. The finding is that the repository never creates them and connects as `postgres` — an operator may have added protections out of band.
- **Untracked local files.** `.env`, `apps/web/.env`, `apps/admin/.env` and `packages/database/.env` exist on disk but are gitignored and not part of the repository. Only variable names were inspected, never values, and their contents are not evidence about any deployment.
- **Frontends audited for architecture, not correctness.** `apps/web/src` and `apps/admin/src` were examined to establish that no data-access path bypasses the API (B-1) and to locate write paths (E-1). Their ~150 components were not reviewed for XSS, client-side authorization assumptions, or state handling.
- **Dependency security not assessed.** `pnpm-lock.yaml` (424 KB) was not audited for known CVEs; no SCA tool was run. D-1 covers licence and vendor lock-in only.
- **Infrastructure outside the repository.** Nginx TLS configuration and rate limiting beyond `deploy/nginx/*.conf`, host firewall rules, GHCR access control, secret storage in GitHub Actions, and log retention are all out of scope.
- **Documentation treated as claim, not evidence.** Per the brief, `quide for project/`, `workspaceroadmap/`, `docs/` and `README.md` were read to identify what the system claims, and cited only where a document's claim was compared against code. Roadmap checkboxes asserting completion were not accepted as evidence of implementation.
- **Coverage of route enumeration.** All 39 controllers were parsed programmatically for effective guard annotations, with comments stripped after an initial pass produced a false positive on `apps/api/src/modules/categories/categories.controller.ts` (a `@Public()` mention inside a comment block); that controller was then read in full and confirmed correctly guarded at `:33,40,47,58,66`. Guard resolution through `ROUTE_ACTION_MAP` and the `translateLegacy` fallback was traced by reading `apps/api/src/modules/policy/policy.service.ts:38-115`, not by execution.
