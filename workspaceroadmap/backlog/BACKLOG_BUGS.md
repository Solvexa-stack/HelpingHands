# Backlog — Bugs discovered by the regression suite (Wave 0)

Pre-existing defects found while writing the W0-E1 regression specs. Per the
wave rules they were **not** fixed mid-story (behavior is frozen; each needs
its own reviewed change). Where a spec pins the buggy behavior, fixing the bug
means flipping the marked assertion in the same PR.

Format follows [BACKLOG_00_OVERVIEW.md](BACKLOG_00_OVERVIEW.md); IDs are `BUG-n`.

---

**BUG-1 · S · api — `study_approved` notifications crash: invalid Prisma query**
Found by: W0-E1-S2 (lifecycle spec run logs).
Where: `apps/api/src/modules/notifications/notifications.processor.ts` (~line 205).
Defect: the voters query passes both `select` and `include` on the `user` relation, and selects `participantId`, which is not a `User` field. Prisma throws `PrismaClientValidationError` on every `study_approved` event; the Bull job fails, so voters/donors never receive study-approval notifications. The failure is invisible outside the queue logs.
Fix: use a single `select` (or `include`) and `referenceId`; add a processor unit test.
AC: study approval in the lifecycle e2e spec produces no `NotificationsProcessor` error in logs.

**BUG-2 · S · api — Rate limiting configured but never enforced**
Found by: W0-E1-S2 (code inspection while writing role-restriction tests).
Where: `apps/api/src/app.module.ts` (ThrottlerModule.forRoot) + `@Throttle()` on auth endpoints.
Defect: `ThrottlerGuard` is never registered (not as `APP_GUARD`, not per-controller), so no request is throttled — including login/forgot-password brute-force paths.
Fix: register `ThrottlerGuard` as a global guard; verify the auth limits (5 login/min) with an e2e test; check the admin/web clients tolerate 429s.
AC: burst of 6 logins within a minute → 6th returns 429; suite green.
Note: enabling this is a behavior change — needs its own story, not a drive-by.

**BUG-3 · S · api — `WebhookLog.processedAt` is never set**
Found by: W0-E1-S3 (donations spec, verified with an isolated Prisma repro).
Where: `apps/api/src/modules/payments/payments.service.ts` → `markWebhookProcessed()`.
Defect: the `updateMany` filter passes the payload object directly (`payload: parsedPayload`); Prisma Json fields require `payload: { equals: parsedPayload }`, so the call throws `PrismaClientValidationError`, which the surrounding try/catch swallows ("Failed to mark webhook as processed"). Result: every webhook log row stays `processedAt: null` forever — the processed/unprocessed distinction the table exists for is lost. Payment dedupe is unaffected (idempotency is donation-status-based, proven by the replay tests).
Fix: use `{ equals: ... }` (or better: return the created log row's id from `logWebhook` and update by id).
AC: flip the two assertions marked `BUG-3` in `apps/api/test/donations.e2e-spec.ts` from `toBeNull()` to `toBeTruthy()`; suite green.

**BUG-4 · S · api — Invalid Stripe webhook signature returns 500 instead of 400**
Found by: W0-E1-S3 (invalid-signature test).
Where: `apps/api/src/modules/payments/payments.service.ts` → `handleStripeWebhook()` rethrows the raw Stripe error; it is not an `HttpException`, so the global filter maps it to 500 and logs it as an unhandled error.
Defect: cosmetic-to-moderate — Stripe treats both 4xx and 5xx as delivery failure and retries, but 500s pollute error monitoring and hide real faults.
Fix: wrap in `BadRequestException` after logging.
AC: invalid signature → 400; the WebhookLog error row is still written; suite green.

**BUG-5 · M · api — Financial endpoints ignore financial-officer project assignment**
Found by: W0-E1-S4 (execution & financial spec).
Where: `apps/api/src/modules/financial/financial.controller.ts` / `financial.service.ts`.
Defect: the donations module restricts financial officers to their assigned projects (`Project.financialOfficerId` check in `donations.service.updateStatus` and list filtering), but the financial module has no such check anywhere — **any** financial officer can create/update budgets, approve/reject expenses, and read or write the transaction ledger of **any** project. Studies and donations list-filter by assignment; financial does not. Authorization inconsistency with real money impact.
Fix: apply the same assignment check used in `donations.service.updateStatus` to mutating financial operations (and decide whether reads should filter like `listStudies` does). Needs a product decision on whether administrators-only bypass applies.
AC: unassigned officer gets 403 on budget create / expense decision / manual transaction for a foreign project; assigned officer flow still green. Update the test `financial officer creates a budget (no project-assignment check — current behavior)` in `apps/api/test/execution.e2e-spec.ts`.
Note: candidate to fold into Wave 1 RBAC work (`08_PERMISSIONS_RBAC_ABAC.md`) rather than a standalone patch.

**BUG-6 · M · api — Refresh-token flow is completely broken (always 401)**
Found by: W0-E1-S5 (verified against the running API and in e2e).
Where: `apps/api/src/modules/auth/auth.controller.ts` → `refreshTokens(0, dto.refreshToken)`.
Defect: the controller passes a hardcoded `userId` of `0`; `AuthService.refreshTokens` filters `where: { userId: 0, token, … }`, which never matches a stored token → every refresh attempt returns 401 "Refresh token invalid or expired". Clients silently fall back to re-login when the 15-minute access token expires.
Fix: decode the userId from the refresh token (verify with `jwt.refreshSecret`) instead of trusting a parameter; then look up by `(userId, token)`.
AC: flip the assertion marked `BUG-6` in `apps/api/test/auth-matrix.e2e-spec.ts` to expect 200 and add rotation assertions (old token revoked, new pair issued); suite green.

**BUG-7 · L · api,db,migration — `User.adminId` / `User.participantId` are never populated → relations always null**
Found by: W0-E1-S5 (verified in code, e2e, and the dev database — all rows NULL).
Where: schema `User.adminId/participantId` FK columns (migration `20260606140000_add_user_relations`) vs. seed + `auth.service.register` + `admins.service`, which only ever set `referenceId/referenceType`.
Defect: the Prisma relations `participant.user` / `admin.user` and `user.participant` / `user.admin` are backed by the FK columns, but no write path fills them. Observable symptoms, all pinned in the suite:
1. Participants can NEVER update their own profile — `participants.service.update` checks `participant.user?.id` (always `undefined`) → 403 even for the owner.
2. `user` is `null` in every include (participant lists, donation lists, admin vote audit) — no emails/avatars in the admin UI.
3. Donation approval/rejection emails are never sent (`donations.service.updateStatus` reads `updated.participant.user?.email` → undefined → silently skipped).
Fix: backfill migration (`UPDATE users SET participant_id = reference_id WHERE reference_type='participant'`, same for admins) + set the columns on user creation; or drop the columns and derive relations from `referenceId/referenceType`. Coordinate with Wave 1 identity work.
AC: fix the marked assertions in `auth-matrix.e2e-spec.ts` (self-update 200 / foreign 403; `user` non-null in participant detail); donation approval e2e asserts an email send attempt.

**BUG-8 · S · api — `GET /study/:id` has no role restriction: drafts and rejection reasons visible to participants**
Found by: W0-E1-S5.
Where: `apps/api/src/modules/study/study.controller.ts` `findOne` (no `@Roles`).
Defect: any authenticated user (participants included) can read any study by id — including `draft`, `in_review` and `rejected` ones with `rejectionReason` and unpublished section content. The public-by-project endpoint carefully filters to published+; the by-id route bypasses that.
Fix: add `@Roles(administrator, employee, financial_officer)` or status-based filtering for non-staff callers.
AC: participant reading an unpublished study → 403/404; the `BUG-8` test in `auth-matrix.e2e-spec.ts` flipped; lifecycle suite still green.

**BUG-9 · S · api — Dashboard endpoints have no role restriction**
Found by: W0-E1-S5.
Where: `apps/api/src/modules/dashboard/dashboard.controller.ts` (no `@Roles` on any route).
Defect: participants can read the admin dashboard (`stats`, `recent-donations`, `recent-projects`, `donations-by-month`) — aggregate and per-donation data across all participants.
Fix: `@Roles(administrator, employee, financial_officer)` at class level (verify the admin UI is the only consumer).
AC: participant → 403 on all dashboard routes; matrix row updated.

**BUG-10 · S · api — Two logins by the same user within one second → 500 (unique-constraint collision)**
Found by: W0-E1-S5 (rapid consecutive logins in the suite hit it deterministically).
Where: `auth.service.generateTokens` + `refresh_tokens.token @unique`.
Defect: the refresh JWT is deterministic per (payload, secret, second) — same user logging in twice within the same `iat` second produces an identical token string, and the second `refreshToken.create` throws P2002 → 500. Real-world: double-click on the login button, or two devices.
Fix: add a `jti`/nonce claim to the refresh payload (or catch P2002 and reuse).
AC: two immediate logins both 200; remove the `BUG-10` sleep workarounds in `auth-matrix.e2e-spec.ts`.

**BUG-11 · S · api — `GET /participants/:id` is not self-scoped for participants**
Found by: W0-E1-S5.
Where: `apps/api/src/modules/participants/participants.controller.ts` `findOne` (`@Roles(..., 'participant')` with no ownership check in `findById`).
Defect: any participant can read any other participant's profile including their last 10 donations with amounts. (Email/avatar currently come back null only because of BUG-7 — fixing BUG-7 without this one widens the leak to emails.)
Fix: scope to self for role `participant`, as `update` already intends to.
AC: participant → 403 (or filtered payload) on foreign ids, 200 on own; the `BUG-11` test flipped. **Fix together with or before BUG-7.**

---

When a bug is fixed, move its entry to a "Fixed" section at the bottom with the PR link.
