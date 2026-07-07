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

---

When a bug is fixed, move its entry to a "Fixed" section at the bottom with the PR link.
