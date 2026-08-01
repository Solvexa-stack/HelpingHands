# HelpingHands — Production Remediation Roadmap

**Companion to:** `COMPLIANCE_AUDIT.md`
**Audience:** Engineering leadership, security, compliance, board
**Goal:** Evolve the existing system into a trustworthy European-grade SaaS platform for NGOs, municipalities and public funds. **No rewrite.** The architecture is an asset; this document hardens it.

---

## 1. Executive Assessment

### 1.1 Current maturity level

**Maturity: late-beta / pre-production. Domain engineering is strong; production hardening has not started.**

| Dimension | Level | Basis |
|---|---|---|
| Domain architecture | **Strong (4/5)** | Double-entry ledger as sole money writer, row-locked workflow engine, ABAC policy registry with real segregation of duties, event-sourced audit design, four custom lint rules enforcing invariants |
| API design | **Strong (4/5)** | Clean API-first separation, versioned, Swagger-documented, no frontend DB access |
| Test discipline | **Moderate (3/5)** | 39 API e2e specs + 6 unit specs exercising the real pipeline; zero frontend tests, no coverage gate |
| Data integrity guarantees | **Weak (2/5)** | Controls exist but are not binding — see §1.2 |
| Security posture | **Weak (1/5)** | Committed fallback signing secrets, inert rate limiting, missing object-level authorization, superuser DB connection |
| Operational readiness | **Absent (0/5)** | No backups, no monitoring, no alerting, no rollback, no readiness probe |
| GDPR / EU compliance | **Absent (0/5)** | No DSAR, no erasure path, no retention policy, no RoPA, no DPIA, no breach-detection capability |

This is not a badly built system. It is a **thoughtfully built system that was never finished for production.** The `workspaceroadmap/` waves show a team that thinks in migration discipline — dual-writes, parity jobs, reconciliation gates, one-flag rollbacks. That discipline is genuinely rare and worth preserving.

### 1.2 The single pattern behind almost every finding

Read the audit end to end and one failure mode repeats in every area:

> **Controls are declared but not bound. Where they are bound, they fail open rather than closed.**

| Control | Declared at | Why it is not binding |
|---|---|---|
| JWT signing secret | `apps/api/src/config/configuration.ts:15,17` | Falls back to a constant in this repo when the env var is absent; nothing validates it at boot |
| Audit append-only | `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40` | `REVOKE` is gated on a role (`helping_hands_app`) the repo never creates; app connects as superuser `postgres` |
| Audit guarantee | `apps/api/src/modules/audit/audit.service.ts:23-52` | Subscriber swallows its own failures; write is outside the mutation's transaction |
| Rate limiting on auth | `apps/api/src/modules/auth/auth.controller.ts:38,54,79` | `@Throttle` metadata with no `ThrottlerGuard` bound to the controller and none registered as `APP_GUARD` |
| Soft delete | `apps/api/src/prisma/soft-delete.middleware.ts:47-49` | `SOFT_DELETE_ENFORCED` defaults `false`; half the financial models are not in the model set anyway |
| Ledger reversal | `apps/api/src/modules/treasury/treasury.service.ts:44` | Stated in a comment; no `reverse()` method and no `reversesTransactionId` column exists |
| Policy enforcement | `apps/api/src/modules/policy/policy.guard.ts:11-13` | Silently degrades to coarse role checks if `POLICY_ENFORCED` is unset — losing all fund/org scoping |
| Treasury as sole ledger writer | `apps/api/src/modules/treasury/treasury.service.ts:42` | Enforced by a lint rule that only covers `src/`; `packages/database/prisma/backfills/w5-treasury-backfill.ts:108` writes the ledger directly |
| MIT licence | `README.md:158` | No `LICENSE` file, no `license` field in any `package.json` |

**This is good news.** It means the remediation is not "build the missing system" — it is "**bind the controls that already exist, and make each binding fail closed.**" That is a fundamentally cheaper, lower-risk programme than the audit's four ❌ verdicts suggest at first glance.

**The governing principle for every item in this roadmap:** *a control that can be disabled by omission is not a control.*

### 1.3 Is the platform safe for production today?

**No. Do not accept real users, real donor PII, or real money on the current build.**

Three findings are individually sufficient to block launch:

1. **Identity can be forged.** If `JWT_SECRET` is absent from the deployed environment, the API signs and verifies tokens with a string published in this repository (`configuration.ts:15`). Nothing validates the variable at boot, and nothing alerts if it is missing. The entire authorization model — however sophisticated — sits on top of this.
2. **The audit trail is not evidence.** It is written best-effort outside the transaction, can be silently lost (`audit.service.ts:46-52`), has no `UPDATE`/`DELETE` protection in any configured environment, and is bypassed entirely by four financial write paths, five services, the cron scheduler, and every seed and backfill script. For a donation platform this is the difference between a system of record and a system of assertion.
3. **Donor PII is retrievable without authorization.** Any authenticated participant can read any donation by id (`donations.controller.ts:41` → `donations.service.ts:81-97`), and the unauthenticated QR-token endpoint returns donor name and email behind a token generated from `Math.random()` (`qr.service.ts:12-15`). Under GDPR this is a reportable personal data breach the day a real donor is entered.

Add to those: authentication is not rate-limited in practice, there is no backup of any kind, and there is no monitoring — so a breach would be neither prevented, contained, nor detected within the 72-hour Article 33 notification window.

### 1.4 Biggest blockers to launch, ranked

| # | Blocker | Why it blocks | Phase |
|---|---|---|---|
| 1 | Forgeable identity (fallback JWT secret, no boot validation) | Total authorization bypass; unquantifiable | 0 |
| 2 | Unauthenticated / unauthorized PII exposure on donation endpoints | GDPR reportable breach on day one | 0 |
| 3 | Inert authentication rate limiting | Credential stuffing, account enumeration, email bombing | 0 |
| 4 | Audit trail neither atomic nor immutable | No defensible record for donors, boards, auditors or regulators | 1 |
| 5 | No backup, no tested restore | One bad migration or disk failure destroys all donation history | 4 |
| 6 | No GDPR apparatus (DSAR, erasure, retention, RoPA, DPIA) | Cannot lawfully process EU personal data; blocks every EU contract | 1 |
| 7 | No monitoring or alerting | Cannot detect a breach, cannot meet the 72h notification duty | 4 |
| 8 | Security enforcement is flag-conditional | A missing env var silently downgrades the entire authorization model | 2 |
| 9 | Superuser database connection | No layer below the application can contain an application compromise | 2 |
| 10 | No reversing entries; hard deletes on financial records | Fails basic accounting control and EU bookkeeping law (GoBD/NF203/SAF-T) | 3 |

### 1.5 Honest effort estimate

| Phase | Scope | Calendar (team of 3) |
|---|---|---|
| Phase 0 | Emergency security | **3–5 days** |
| Phase 1 | Compliance foundation + GDPR | 5–7 weeks |
| Phase 2 | Security hardening | 4–6 weeks |
| Phase 3 | Financial maturity | 5–7 weeks |
| Phase 4 | Operational reliability | 3–4 weeks |
| Phase 5 | Enterprise readiness | 8–12 weeks (largely parallel / post-launch) |
| **To first paying customer (0–1–2–4 core)** | | **≈ 3.5–4.5 months** |

The critical observation: **Phase 0 is small.** The emergency set is roughly one engineer-week. The expensive work is compliance and operations, not fixing broken code.

---

## 2. Prioritized Remediation Roadmap

Legend — **Priority:** P0 Critical · P1 High · P2 Medium · P3 Low.
**Complexity:** Small (≤3 days) · Medium (1–2 weeks) · Large (3+ weeks).

---

## Phase 0 — Emergency Security Fixes

> **Gate: nothing deploys to a production-facing environment until every P0 here is closed.**
> Total effort ≈ 1 engineer-week. All items are small, surgical, and independently shippable.

### 0.1 — Remove fallback JWT secrets and validate configuration at boot

- **Problem.** `apps/api/src/config/configuration.ts:15,17` default the access and refresh signing secrets to literal strings committed to this repository. `apps/api/src/app.module.ts:45-51` calls `ConfigModule.forRoot` with no `validationSchema`, so a missing variable is silently accepted.
- **Business risk.** Complete authentication bypass. An attacker who reads the public repository can mint an administrator token if the variable is unset in any environment. Every other security control in the system is downstream of this. **Catastrophic, unbounded.**
- **Technical solution.** Delete both `|| 'fallback-...'` defaults. Add a Joi (or `class-validator`) `validationSchema` to `ConfigModule.forRoot` requiring `JWT_SECRET` and `JWT_REFRESH_SECRET` at ≥32 bytes of entropy, plus `DATABASE_URL`, `POLICY_ENFORCED=true`, `TENANCY_ENFORCED=true`. Process must refuse to boot on failure — no warning-and-continue. Rotate both secrets immediately after deploy (this invalidates all sessions; `AuthService.TOKEN_VERSION` already exists as the forced-reauth mechanism).
- **Files.** `apps/api/src/config/configuration.ts`, `apps/api/src/app.module.ts:45`, `apps/api/src/modules/auth/auth.service.ts:242` (token version bump), `.env.example`.
- **Dependencies.** None. Do this first.
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Removes the single highest-severity risk in the system.

### 0.2 — Bind ThrottlerGuard so authentication rate limiting actually applies

- **Problem.** `apps/api/src/modules/auth/auth.controller.ts:38,54,79` declare `@Throttle` limits on login, activate-invite and forgot-password. `ThrottlerGuard` is bound nowhere: the controller carries only `@UseGuards(JwtAuthGuard)` (`:31`), and `apps/api/src/modules/auth/auth.module.ts:33-37` registers only `JwtAuthGuard`, `PolicyGuard`, `RolesGuard` as `APP_GUARD`. `ThrottlerModule.forRoot` (`app.module.ts:52-55`) configures limits with no reader. Only `transparency.controller.ts:25` and `exports.controller.ts:44` are actually throttled. **`POST /api/v1/auth/register` carries no `@Throttle` at all.**
- **Business risk.** Unlimited password brute-force and credential stuffing against `/api/v1/auth/login`; unlimited account enumeration via forgot-password; unlimited account creation and outbound email volume via register and forgot-password (SMTP reputation destruction, cost). The system *appears* protected in code review, which is worse than visibly unprotected.
- **Technical solution.** Register `{ provide: APP_GUARD, useClass: ThrottlerGuard }` globally so `@Throttle` metadata is honoured everywhere and every route inherits the `short`/`long` defaults. Add `@Throttle` to `register`. Configure `trust proxy` on the Express instance so the throttler keys on the real client IP behind nginx rather than the proxy IP — without this the global limit becomes a shared bucket and is worse than useless. Add nginx-layer `limit_req` in `deploy/nginx/api.conf` as defence in depth.
- **Files.** `apps/api/src/app.module.ts` or `apps/api/src/modules/auth/auth.module.ts:29-38`, `apps/api/src/main.ts:21`, `apps/api/src/modules/auth/auth.controller.ts:45`, `deploy/nginx/api.conf`.
- **Dependencies.** None.
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Closes brute-force, enumeration and mail-bomb vectors in one change.

### 0.3 — Enforce object-level authorization on donations

- **Problem.** `apps/api/src/modules/donations/donations.controller.ts:41-46` has no `@Roles`, no registry entry, and `donations.service.ts:81-97` performs no ownership check. The tenancy assertion it relies on no-ops for participants because `activeOrgId` is null for them (`tenancy.repository.ts:94`, `actor-context.ts:19`, `auth.service.ts:326`). The response includes `participant.user.email` (`:89`). The equivalent online-donation endpoint *does* check ownership (`payments.service.ts:204-206`) — the cash path simply omits it.
- **Business risk.** Any registered participant enumerates donation ids and harvests every donor's name, email, amount and QR token. GDPR Article 33 reportable breach; direct reputational loss with the donor base.
- **Technical solution.** Thread `referenceType`/`referenceId` into `findById` and reject when a participant requests a donation they do not own, mirroring `payments.service.ts:204-206`. Return 404 rather than 403 so ids are not confirmed. Add an e2e row to the `auth-matrix` MATRIX covering cross-participant access.
- **Files.** `apps/api/src/modules/donations/donations.service.ts:81`, `donations.controller.ts:41`, `apps/api/test/auth-matrix.e2e-spec.ts:68`.
- **Dependencies.** None. (Item 2.3 later generalises this fix across all resources.)
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Closes an active PII breach path.

### 0.4 — Reduce the public QR-token response and replace the token RNG

- **Problem.** `apps/api/src/modules/donations/donations.controller.ts:49-53` is `@Public()` and returns the full donation graph including donor first name, last name and email (`donations.service.ts:100-111`) to any unauthenticated caller. The only secret is a 32-character token built with `Math.random()` (`qr.service.ts:12-15`), which in V8 is a recoverable-state PRNG.
- **Business risk.** Unauthenticated donor PII disclosure. Observing a handful of issued tokens makes subsequent tokens predictable, converting a per-donation secret into a bulk-harvest vector.
- **Technical solution.** Replace `Math.random()` with `crypto.randomBytes(24).toString('base64url')`. Reduce the `@Public()` response to what an employee needs at the counter — project name, amount, status, reference — with all donor identity removed; if verification staff need the donor name, move that behind authentication and serve it from the authenticated route. Backfill-rotate existing tokens or accept them as legacy with a documented expiry.
- **Files.** `apps/api/src/modules/qr/qr.service.ts:9-16`, `apps/api/src/modules/donations/donations.service.ts:99-115`, `apps/api/src/modules/donations/donations.controller.ts:49`.
- **Dependencies.** Coordinate with the admin QR-scan screen (`apps/admin/src/app/(dashboard)/donations/[token]/page.tsx`).
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Closes unauthenticated PII disclosure.

### 0.5 — Scope the file listing endpoint

- **Problem.** `apps/api/src/modules/files/files.controller.ts:91-99` accepts arbitrary `referenceId`/`referenceType` with no role restriction, and `files.service.ts:47-52` applies no scoping.
- **Business risk.** Any authenticated user enumerates file metadata for any entity — including organization verification documents and study attachments, which carry commercially and personally sensitive content.
- **Technical solution.** Require that the caller can see the parent entity: route through `TenancyRepository.assertProjectVisible` for project-scoped references and equivalent checks for organization and study references; reject unknown `referenceType` values against an allowlist.
- **Files.** `apps/api/src/modules/files/files.service.ts:47`, `files.controller.ts:91`.
- **Dependencies.** None.
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Closes document-metadata enumeration.

### 0.6 — Make destructive and credential-bearing scripts refuse to run in production

- **Problem.** `packages/database/prisma/seed.ts:44,66,88,110` hardcodes four account passwords, republished in `README.md:63-68`. `packages/database/package.json:10` exposes `db:reset` = `prisma migrate reset --force`, which drops every table including `audit_logs`. Both are runnable against any database the operator's `DATABASE_URL` points at.
- **Business risk.** Known-credential administrator access if the seed is ever run against production; total irrecoverable data loss if `db:reset` is run against production (and there are no backups — see 4.1).
- **Technical solution.** Add a hard `if (process.env.NODE_ENV === 'production') throw` guard at the top of `seed.ts`, `seed-demo.ts` and every backfill entry point. Read seed passwords from environment variables with no defaults. Remove `db:reset` from `packages/database/package.json` or rename it `db:reset:local` with the same production guard. Rotate the four seeded accounts in any environment where the seed has run.
- **Files.** `packages/database/prisma/seed.ts:1`, `seed-demo.ts:19`, `packages/database/prisma/backfills/run-w1.ts`, `packages/database/package.json:10-12`, `README.md:63-68`.
- **Dependencies.** None.
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Removes known-credential access and the single most destructive available command.

### 0.7 — Operational verification sweep (no code)

- **Problem.** The repository permits silent security downgrade; whether the live deployment is downgraded is unknown from source.
- **Technical solution.** On the production host, confirm in the live `.env`: `JWT_SECRET` and `JWT_REFRESH_SECRET` present and high-entropy; `POLICY_ENFORCED=true`; `TENANCY_ENFORCED=true`; `NODE_ENV=production`. Confirm `POSTGRES_PASSWORD` is not the compose-file literal `password` (`docker-compose.yml:8`). Confirm TLS is actually terminated — `deploy/nginx/api.conf` ships as an HTTP-only template with certbot applied manually. Confirm the four seeded accounts do not exist with default passwords. Record the result.
- **Priority.** **P0** · **Complexity.** Small · **Impact.** Establishes whether an incident has already occurred.

---

## Phase 1 — Compliance Foundation

> Audit trail becomes evidence; GDPR apparatus is built. This is the phase that makes the platform *lawful* to operate in the EU.

### 1.1 — Transactional outbox: make the audit write atomic with the mutation

- **Problem.** Audit rows are written by an event subscriber outside the mutating transaction (`apps/api/src/modules/audit/audit.service.ts:32-45`), and failures are logged and swallowed (`:46-52`). `apps/api/src/events/event-bus.service.ts:135-145` catches subscriber errors by design.
- **Business risk.** A financial change can succeed while its audit record silently does not. The trail is therefore incomplete by construction and cannot be relied on by a board, an external auditor, or a court.
- **Technical solution.** Introduce a `domain_outbox` table written **inside** the same transaction as the mutation. `EventBusService.publishAfterCommit` (`event-bus.service.ts:99-111`) already models the transaction boundary — extend it so `buffer.add()` inserts an outbox row via the transaction client rather than only buffering in memory. A relay (Bull queue, already configured at `app.module.ts:57-66`) drains the outbox into `audit_logs` and in-process subscribers with at-least-once delivery; the existing `@@unique([requestId, action, subjectType, subjectId])` index (`schema.prisma:990`) already makes replay idempotent. Failed audit persistence now rolls back the business change.
- **Files.** `apps/api/src/events/event-bus.service.ts:17-41,99-116`, `apps/api/src/modules/audit/audit.service.ts:23`, new migration for `domain_outbox`, `apps/api/src/modules/notifications/notifications.processor.ts` (pattern reference).
- **Dependencies.** None. **This is the highest-leverage single change in the entire roadmap** — it is a prerequisite for 1.2 and materially strengthens 2.6.
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Converts the audit trail from best-effort to guaranteed.

### 1.2 — Close audit coverage gaps

- **Problem.** Financial and identity writes that emit no event and therefore produce no audit row: `apps/api/src/modules/financial/financial.service.ts:72,92,104,164` (budget create/update/delete, expense update); and five services that do not inject `EventBusService` at all — `files.service.ts:28,34,71,78,83,88`, `languages.service.ts:26,32,38,44`, `participants.service.ts:112,124,133`, `notifications.service.ts:48,55,83`, plus the cron writes at `voting.scheduler.ts:52-59`. 35 `eslint-disable require-actor-context` suppressions mark the debt.
- **Business risk.** Budget manipulation — the object that authorises spending — is untraceable. Participant PII changes are untraceable, which defeats GDPR Article 5(2) accountability.
- **Technical solution.** Thread `ActorContext` and publish domain events from every mutating method in those services. Give the scheduler a `systemActor()` context (the helper already exists at `actor-context.ts:23-31`). Then **make the lint rule non-suppressible**: convert `require-actor-context` from a suppressible rule to one that fails CI when the suppression count exceeds a ratchet, and drive the ratchet to zero. Treat the 35 suppressions as a tracked burn-down with a named owner.
- **Files.** `apps/api/src/modules/financial/financial.service.ts`, `files.service.ts`, `languages.service.ts`, `participants.service.ts`, `notifications.service.ts`, `voting.scheduler.ts`, `apps/api/eslint-rules/require-actor-context.js`, CI config.
- **Dependencies.** 1.1 (so the new events are durable).
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Completes the accountability record.

### 1.3 — Make audit immutability real at the database layer

- **Problem.** The append-only `REVOKE` at `packages/database/prisma/migrations/20260708161533_add_audit_log/migration.sql:33-40` is gated on a role `helping_hands_app` that the repository never creates; and the application connects as superuser `postgres` (`docker-compose.prod.yml:38`), for which grants do not apply.
- **Business risk.** Any application compromise, any operator with `DATABASE_URL`, or any SQL-injection foothold can rewrite history. An audit log that the audited party can edit has no evidentiary value.
- **Technical solution.** Migration that (a) creates role `helping_hands_app` with `SELECT, INSERT` only on `audit_logs` and no `UPDATE`/`DELETE`/`TRUNCATE`, (b) adds a `BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs` trigger raising unconditionally so even superuser writes fail, (c) revokes `TRUNCATE` broadly. Switch `DATABASE_URL` to the restricted role; reserve superuser credentials for migrations only, injected separately in CI. Consider a monthly hash-chain anchor (`prev_hash` column, or periodic digest published externally) for tamper *evidence* on top of tamper *resistance*.
- **Files.** New migration under `packages/database/prisma/migrations/`, `docker-compose.prod.yml:38`, `.github/workflows/deploy.yml:118`, `.env.example`.
- **Dependencies.** 2.6 (least-privilege role) — do these together; 0.6 and 1.6 must land first so scripts no longer require superuser.
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Makes the audit trail defensible to a regulator.

### 1.4 — GDPR: data subject access and portability (Articles 15 & 20)

- **Problem.** No per-person export exists. `apps/api/src/modules/transparency/exports.controller.ts` and `reports.controller.ts` export per project, fund and organization only; the audit trail is paginated JSON for administrators only (`audit.controller.ts:15`).
- **Business risk.** A DSAR must be answered within one month. With no tooling this is manual database extraction — slow, error-prone, and itself a data-handling risk. Unanswered DSARs are a supervisory-authority complaint trigger and a standard procurement disqualifier.
- **Technical solution.** `GET /api/v1/privacy/subject-export` (self-service for the authenticated subject) and an administrator-initiated variant, returning machine-readable JSON covering every table holding that person's data: `User`, `Participant`, `Donor`, `ProjectDonation`, `OnlineDonation`, `FundDonation`, `Vote`, `StudyVote`, `Notification`, `File` uploads, and `AuditLog` rows where they are the actor or subject. Build a central `PII_REGISTRY` mapping model → PII columns → lawful basis, and generate the export from it so new models cannot be forgotten. Every export emits `privacy.subject_exported` to the audit trail.
- **Files.** New `apps/api/src/modules/privacy/` module, `packages/database/prisma/schema.prisma` (registry annotations), reuse `apps/api/src/modules/transparency/csv.util.ts:2`.
- **Dependencies.** 1.1 (so exports are themselves audited).
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Unblocks every EU contract; removes a manual compliance burden.

### 1.5 — GDPR: erasure that survives financial immutability (Article 17)

- **Problem.** No erasure mechanism exists. There is also a genuine architectural tension: Article 17 erasure versus the immutability this platform correctly wants for financial records — and versus national bookkeeping retention (typically 7–10 years).
- **Business risk.** Naïvely deleting rows destroys financial integrity and breaks the ledger. Refusing erasure outright is unlawful. Getting this wrong in either direction is a serious finding.
- **Technical solution — crypto-shredding plus pseudonymization.** (1) Move donor and participant identity columns (`Donor.name/contactEmail/contactPhone/contactAddress/taxId` at `schema.prisma:1469-1474`, `Participant`, `User.email`) into an envelope-encrypted store with a **per-subject data encryption key**. (2) Erasure destroys that subject's key: the financial rows, ledger entries and audit rows remain intact and reconcilable, but the identity becomes cryptographically unrecoverable. (3) Replace the display identity with a stable pseudonym (`Donor #4711 (erased 2026-08-02)`). (4) Where retention law requires the identity to persist (invoices, tax records), rely on Article 17(3)(b) and record the refusal with its legal basis rather than silently ignoring the request. (5) Publish the retention schedule per data class and enforce it with a scheduled job.
- **Files.** New `apps/api/src/modules/privacy/`, key management (KMS or a sealed keystore), migration for encrypted columns and a `subject_keys` table, `schema.prisma:1467-1500,384-466`.
- **Dependencies.** 1.4 (shared PII registry), 2.5 (secret management for the key-encryption key).
- **Priority.** **P1** · **Complexity.** Large · **Impact.** Resolves the erasure/immutability conflict correctly; a genuine differentiator in public-sector procurement.

### 1.6 — Route seeds and backfills through the governed client

- **Problem.** `packages/database/prisma/seed.ts:12`, `seed-demo.ts:9`, `backfills/run-w1.ts:4` instantiate raw `new PrismaClient()`, bypassing all four middlewares from `prisma.service.ts:18-24` and every audit subscriber. `backfills/w5-treasury-backfill.ts:108` writes `LedgerTransaction` rows directly, bypassing `TreasuryService` — declared the sole ledger writer at `treasury.service.ts:42` — and the `treasury-only-ledger-writes` lint rule, whose file gating only covers `src/`.
- **Business risk.** The most privileged, least observed code in the system can write money facts with no audit and no invariant checks. This is the textbook definition of a backdoor, and it is the audit's single most important finding (C-2).
- **Technical solution.** Export a configured client factory from `packages/database` with all middlewares attached; make it the only exported client. Give scripts an explicit `scriptActor(name, runId)` context and emit domain events written through the outbox so a backfill appears in the audit trail as a first-class actor. Extend the `treasury-only-ledger-writes` lint rule's path matching to cover `packages/database/**`. Require backfills to be idempotent and to log a summary row.
- **Files.** `packages/database/src/` (new client export), `prisma/seed.ts`, `seed-demo.ts`, all six files under `prisma/backfills/`, `apps/api/eslint-rules/treasury-only-ledger-writes.js`, `apps/api/src/events/actor-context.ts:23`.
- **Dependencies.** 1.1.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Closes the largest audit-bypass surface.

### 1.7 — GDPR governance artifacts and processor chain

- **Problem.** No Record of Processing Activities, no DPIA, no data-processing agreements, no sub-processor register, no retention policy, no breach-response runbook. Sub-processors in use: Stripe and PayPal (`payments.service.ts`), the SMTP provider (`configuration.ts:21` defaults to a live third party), the VPS host, and GitHub Container Registry (`deploy.yml:19`).
- **Business risk.** Article 30 RoPA is mandatory; a DPIA is very likely required here (financial data + potentially vulnerable beneficiaries + public-authority customers, Article 35). Without DPAs and Chapter V transfer safeguards for US processors, EU personal data cannot lawfully flow to Stripe/PayPal. Municipal and NGO procurement will request all of these before signing.
- **Technical solution.** Produce and version-control: RoPA, DPIA, retention schedule, sub-processor register with a customer-notification commitment, breach-response runbook mapped to the 72-hour duty, and a customer-facing DPA template with SCCs. Confirm and document hosting region (EU) and data residency. Review `prisma.service.ts:14` — Prisma query logging in non-production can capture PII into logs; ensure it is off wherever real data exists and add log scrubbing.
- **Files.** New `compliance/` directory, `apps/api/src/prisma/prisma.service.ts:14`, deployment documentation.
- **Dependencies.** 4.2 (breach detection depends on monitoring existing).
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Converts "we take privacy seriously" into evidence a procurement officer accepts.

---

## Phase 2 — Security Hardening

### 2.1 — Burn down the enforcement feature flags

- **Problem.** Security enforcement is conditional on environment variables: `POLICY_ENFORCED` (`policy.guard.ts:11-13`), `TENANCY_ENFORCED` (`tenancy.repository.ts:9-11`), `SOFT_DELETE_ENFORCED` (`soft-delete.middleware.ts:47-49`, defaulting `false`), `WORKFLOW_ENFORCED`, `TREASURY_LEDGER_READS`. If `POLICY_ENFORCED` is unset, `PolicyGuard` becomes a no-op returning `true` (`:158`) and the coarse `RolesGuard` takes over, losing all fund and organization scoping.
- **Business risk.** A deployment mistake, a forgotten variable, or a restored-from-template `.env` silently downgrades the entire authorization and isolation model with no error and no alert. The flags were correct migration scaffolding for the Wave 0–9 programme; **they have served their purpose and are now a liability.**
- **Technical solution.** Confirm the parity/reconciliation jobs are green, then remove each flag and make enforcement unconditional. Delete the dormant `RolesGuard` legacy path (`roles.guard.ts:12`) and the shadow-mode branch of `PolicyGuard` (`policy.guard.ts:118-158`) — that dead code is itself a hazard, because it is the branch that runs when the flag is missing. Retain `@Roles` metadata only as input to the policy translation. Until removal is complete, 0.1's boot validation must assert the flags are `true`.
- **Files.** `apps/api/src/modules/policy/policy.guard.ts:11,96-158`, `apps/api/src/common/guards/roles.guard.ts:11-12`, `apps/api/src/modules/policy/tenancy.repository.ts:9`, `apps/api/src/prisma/soft-delete.middleware.ts:47`, `.env.example:70-90`.
- **Dependencies.** 0.1; parity evidence per `workspaceroadmap/backlog/BACKLOG_W8_CONSOLIDATION.md`.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Removes an entire class of silent-downgrade failure.

### 2.2 — Fix the participant tenancy blind spot as a class of bug

- **Problem.** `tenancy.repository.ts:94` and `:45` return early when `actor.activeOrgId == null`. Participants always have null (`actor-context.ts:19`, `auth.service.ts:326`), so every tenancy check silently passes for them. This is the root cause of finding 0.3 and is structural, not incidental.
- **Business risk.** Every current and future call site that relies on `assertProjectVisible` for authorization is unprotected against participants. The next developer adding a participant-reachable endpoint inherits the hole invisibly.
- **Technical solution.** Make the null case explicit and fail closed: distinguish "system/anonymous actor — scoping not applicable" from "participant — organization scoping does not apply, therefore an *ownership* check is required." Introduce `assertSubjectOwnership(actor, resource)` and make it mandatory on participant-reachable routes. Add a test-level invariant that enumerates participant-reachable routes and asserts each has either a role restriction or an ownership assertion.
- **Files.** `apps/api/src/modules/policy/tenancy.repository.ts:42-51,91-120`, `apps/api/src/modules/policy/tenancy.repository.spec.ts`, `apps/api/test/w2-tenancy-leak.e2e-spec.ts`.
- **Dependencies.** 0.3.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Converts a recurring bug class into a structural guarantee.

### 2.3 — Systematic object-level authorization sweep

- **Problem.** The audit found two instances (donations, files) by inspection. Routes with no `@Roles` and no `ROUTE_ACTION_MAP` entry fall through to `policy.service.ts:95-98,52-54` and allow **any authenticated identity**, relying entirely on service-layer scoping that is applied inconsistently — present at `payments.service.ts:204-206` and `notifications.service.ts:44-50`, absent at `donations.service.ts:81`.
- **Business risk.** Broken object-level authorization is the most commonly exploited API weakness in production SaaS. Two were found by reading; the fall-through default means more are likely.
- **Technical solution.** Enumerate every route resolving to `authenticatedOnly` and classify each as owner-scoped, role-scoped or genuinely open. Replace the permissive fall-through in `translateLegacy` with **deny-by-default**: an unmapped route returns 403 and fails CI via a test that asserts `ROUTE_ACTION_MAP` ∪ `@Roles` ∪ `@Public` covers 100% of registered routes. Extend the `auth-matrix` e2e to include cross-tenant and cross-participant reads for every resource, not only role checks.
- **Files.** `apps/api/src/modules/policy/policy.service.ts:95-98`, `apps/api/src/modules/policy/policy-registry.ts:265-390`, `apps/api/test/auth-matrix.e2e-spec.ts:68-123`, new route-coverage spec.
- **Dependencies.** 2.1, 2.2.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Eliminates the fall-through that produced the Phase 0 findings.

### 2.4 — Response serialization and field-level output control

- **Problem.** Field-level control exists only on the public transparency surface (`transparency.controller.ts:61-64,75-77`). Internal endpoints return whole Prisma objects — `donations.service.ts:89` returns `participant.user.email` to every caller with route access; `reports.service.ts:320-338` writes donor name and email to a spreadsheet with no audit record.
- **Business risk.** Over-fetching leaks PII to roles that do not need it, violating Article 5(1)(c) data minimisation, and makes future schema additions leak by default.
- **Technical solution.** Introduce response DTOs with `class-transformer` `@Expose`/`@Exclude` and a global `ClassSerializerInterceptor` (`app.setup.ts:31` already hosts the interceptor chain). Define per-role serialization groups so donor identity is emitted only to roles with a `donor.read`-class grant. Emit `report.exported` / `data.exported` events on every PII-bearing export.
- **Files.** `apps/api/src/app.setup.ts:29-32`, new `dto/` response classes per module, `apps/api/src/modules/reports/reports.service.ts:310`.
- **Dependencies.** 1.1.
- **Priority.** **P2** · **Complexity.** Large · **Impact.** Data minimisation by construction; makes PII exports auditable.

### 2.5 — Secret management and rotation

- **Problem.** Secrets live in a `.env` file mounted into containers (`docker-compose.prod.yml:34`). No rotation procedure, no versioning, no access log. Dev compose contains a literal Postgres password (`docker-compose.yml:8,41`).
- **Business risk.** Host compromise or an accidental copy exposes every credential simultaneously — DB, JWT signing keys, Stripe, PayPal, SMTP. No rotation path means a suspected leak has no clean recovery.
- **Technical solution.** Move to a managed secret store (cloud KMS/Secrets Manager, HashiCorp Vault, or at minimum SOPS-encrypted files with a documented key). Inject at container start rather than persisting plaintext on disk. Document and rehearse rotation for each secret class; make JWT rotation routine using the existing `TOKEN_VERSION` mechanism (`auth.service.ts:242`). Replace the dev compose literal with a generated value. Add secret scanning (gitleaks/trufflehog) to CI to prevent regression.
- **Files.** `docker-compose.prod.yml:34`, `docker-compose.yml:8,41`, `.github/workflows/deploy.yml`, deployment docs.
- **Dependencies.** 0.1.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Contains blast radius; enables incident recovery.

### 2.6 — Least-privilege database role

- **Problem.** The application connects as superuser `postgres` (`docker-compose.prod.yml:38`, `docker-compose.yml:41`). No layer below the application constrains it.
- **Business risk.** Application compromise equals total database compromise — schema drops, audit rewriting, mass exfiltration. It also renders every table-level protection in the schema decorative.
- **Technical solution.** Create `helping_hands_app` with `SELECT, INSERT, UPDATE, DELETE` on domain tables, `SELECT, INSERT` only on `audit_logs`, `SELECT, INSERT` only on `ledger_transactions` and `ledger_entries`, and no DDL. Run migrations under a separate `helping_hands_migrator` role, credentials injected only into the CI migration step. Add `pgcrypto`/TDE-equivalent encryption at rest and confirm TLS on the database connection.
- **Files.** New migration, `docker-compose.prod.yml:38`, `.github/workflows/deploy.yml:118-122`, `.env.example`.
- **Dependencies.** 1.3 (same migration), 1.6 (scripts must stop needing superuser first).
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Adds the missing containment layer beneath the application.

### 2.7 — Transport, CORS and proxy hardening

- **Problem.** `apps/api/src/main.ts:28-42` hard-codes `http://localhost:3200/3001/3002` and `127.0.0.1` origins into the CORS allowlist alongside configured values, with `credentials: true` — in production these remain permitted. `deploy/nginx/*.conf` ship as HTTP-only templates with TLS applied manually via certbot and no HSTS, no security headers at the proxy, and no `limit_req`. `apps/api/src/health/health.controller.ts:12-14` returns a static `{status:'ok'}` — a liveness probe with no database or Redis readiness check, so `deploy.yml:139` can report a healthy deploy while the database is unreachable.
- **Business risk.** Localhost origins with credentials enable attacks from a developer machine or any locally-bound malicious process. Missing HSTS permits downgrade. A liveness-only probe means a broken deployment reports success and rolls forward.
- **Technical solution.** Derive CORS origins solely from configuration, environment-gated, with localhost entries only when `NODE_ENV !== 'production'`. Add HSTS, CSP and referrer policy at the proxy; enforce TLS 1.2+; add `limit_req` zones. Split `/api/health` (liveness) from `/api/ready` (checks Postgres and Redis) and point the compose healthcheck and CD gate at readiness.
- **Files.** `apps/api/src/main.ts:27-42`, `deploy/nginx/api.conf`, `web.conf`, `admin.conf`, `apps/api/src/health/health.controller.ts`, `docker-compose.prod.yml:44-50`, `.github/workflows/deploy.yml:139`.
- **Dependencies.** None.
- **Priority.** **P2** · **Complexity.** Small · **Impact.** Closes transport-layer gaps; makes deployment health meaningful.

---

## Phase 3 — Financial System Maturity

> The ledger is the strongest part of this codebase. This phase completes it into an accounting system an auditor will sign off.

### 3.1 — Reversing entries as the sole correction mechanism

- **Problem.** `treasury.service.ts:44` states "corrections are reversing transactions" but no such mechanism exists — no `reverse()` method, no `reversesTransactionId` column (`schema.prisma:1382-1400`). The only correction path is a generic manual entry (`financial.service.ts:265-299`) with no link to what it corrects. `flagTransaction` (`treasury.service.ts:286-296`) emits an event and changes no balance.
- **Business risk.** Errors cannot be corrected in an auditable, traceable way. Operators will either leave errors in place or reach for direct database edits — the exact behaviour the immutable ledger exists to prevent.
- **Technical solution.** Add `TreasuryService.reverse(actor, transactionId, reason)` posting a mirror-image balanced transaction with a `reversesTransactionId` FK and a mandatory reason. Enforce one reversal per transaction. Expose it behind a dedicated policy action with four-eyes approval for amounts above a threshold. Render original and reversal as a linked pair in statements and the transparency layer so the correction is visible rather than netted away.
- **Files.** `apps/api/src/modules/treasury/treasury.service.ts:89`, `treasury.controller.ts`, `schema.prisma:1382`, `apps/api/src/modules/policy/policy-registry.ts`, `apps/api/src/modules/transparency/exports.controller.ts:110`.
- **Dependencies.** 1.1.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Completes the accounting model; required for external audit sign-off.

### 3.2 — Eliminate hard deletes on financial and governance records

- **Problem.** `financial.service.ts:104` (budget), `:218` (expense), `study.service.ts:663-667` (votes, vote rounds), `projects.service.ts:386-387` (workflow instance and step log — the lifecycle evidence trail), `milestones.service.ts:91`. `soft-delete.middleware.ts:26-44` omits `Vote`, `VoteRound`, `StudyVote`, `WorkflowInstance`, `WorkflowStepLog`, `LedgerTransaction`, `LedgerEntry`, `Expense`, `FundAllocation`, `FundDonation`, `ProjectTransaction`; and `project-transaction-freeze.middleware.ts:5` explicitly permits deletes on the financial journal.
- **Business risk.** Governance votes and workflow history — the evidence that a decision was properly made — are physically destroyable. Fails EU bookkeeping requirements (GoBD in Germany, NF203 in France) which mandate unalterable records.
- **Technical solution.** Replace those `delete` calls with status transitions or soft delete. Extend `SOFT_DELETE_MODELS` to every financial and governance model, and make `SOFT_DELETE_ENFORCED` unconditional (see 2.1). Remove the delete exemption in the `ProjectTransaction` freeze. Back this with a database trigger denying `DELETE` on ledger and governance tables (paired with 2.6) so the guarantee does not depend on application code.
- **Files.** `apps/api/src/prisma/soft-delete.middleware.ts:26-49`, `project-transaction-freeze.middleware.ts:5`, `financial.service.ts:104,218`, `study.service.ts:663-667`, `projects.service.ts:386-387`, `milestones.service.ts:91`, new migration.
- **Dependencies.** 2.1, 2.6.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Makes the financial and governance record genuinely unalterable.

### 3.3 — Budget lifecycle states

- **Problem.** `ProjectBudget` (`schema.prisma:855-880`) has no status column, and `removeBudget` (`financial.service.ts:100-105`) has no guard at all — a budget carrying `approvedAmount` and accumulated `actualAmount` (`:193-196`) is deletable at any time by an administrator.
- **Business risk.** The object that authorises spending has no approval state and no post-approval protection, while the expenses it governs are correctly protected (`:161,:217`). Spending authority is untraceable and revocable without record.
- **Technical solution.** Add `status: draft | submitted | approved | closed` with a migration, route transitions through the existing workflow engine, and gate `updateBudget`/`removeBudget` on `status !== 'approved'` — mirroring the expense rules already in the same file. Require approval before a budget can be referenced by an expense.
- **Files.** `schema.prisma:855`, `apps/api/src/modules/financial/financial.service.ts:85,100`, `financial.controller.ts:43,55`, migration, `apps/admin/src/app/(dashboard)/projects/[id]/financial/page.tsx`.
- **Dependencies.** 1.2.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Closes the A-2 gap; completes the spending-authority chain.

### 3.4 — Accounting period close and sequential numbering

- **Problem.** No period-close concept exists — transactions can be posted to any date indefinitely. No sequential, gapless document numbering for donations, expenses or invoices; ids are database sequences with no guarantee of continuity in the presented record.
- **Business risk.** Without period locking, a reconciled and reported financial period can be silently altered afterwards, invalidating already-published transparency figures. Gapless sequential numbering is a hard requirement under GoBD (DE), NF203/NF525 (FR) and SAF-T regimes (PT, NO, PL, LT, RO) — a blocker for those markets.
- **Technical solution.** Add an `accounting_periods` table with `open | closed | locked`; reject postings into a closed period at the `TreasuryService.post` boundary (`treasury.service.ts:89`) so no caller can bypass it. Add gapless per-year sequence numbers for donations, expenses and invoices, generated inside the posting transaction. Snapshot period-end balances so published figures are reproducible.
- **Files.** `apps/api/src/modules/treasury/treasury.service.ts:89`, new migration, `apps/api/src/modules/transparency/transparency-read.service.ts`.
- **Dependencies.** 3.1, 3.2.
- **Priority.** **P2** · **Complexity.** Large · **Impact.** Unlocks German, French and Nordic markets; makes published figures immutable.

### 3.5 — Multi-currency and FX

- **Problem.** Every currency column defaults to `USD` (`schema.prisma:721,1371,1409,1512`). `Account` is unique on `(ownerType, name, currency)` (`:1377`) so multiple currencies per owner are representable, but there is no FX rate table, no conversion, and no reporting-currency concept. `treasury.service.ts:121` defaults postings to USD.
- **Business risk.** A platform targeting European NGOs and municipalities that defaults to USD and cannot convert is not viable for EUR-denominated funds. Cross-currency donations would silently mis-post.
- **Technical solution.** Introduce `fx_rates` (currency pair, rate, effective date, source) and a per-organization reporting currency. Store every entry in both transaction currency and reporting currency at the rate effective on the posting date — never re-translate historical entries. Extend balances, statements and the transparency layer to be currency-aware. Change the default to EUR or make it explicitly required per organization.
- **Files.** `schema.prisma:1366-1415`, `apps/api/src/modules/treasury/treasury.service.ts:89-229`, `transparency-read.service.ts`, `exports.controller.ts:110`, migration.
- **Dependencies.** 3.4.
- **Priority.** **P2** · **Complexity.** Large · **Impact.** Prerequisite for the European market.

### 3.6 — Automate reconciliation and elevate it to a control

- **Problem.** `treasury.service.ts:232-282` implements a per-project reconciliation comparing the legacy journal net against the ledger balance, but it is exposed only as an administrator endpoint (`treasury.controller.ts:34-36`). Nothing runs it on a schedule and nothing alerts on divergence. The parity services (`role-parity.service.ts`, `decision-parity.service.ts`, `workflow-parity.service.ts`, `fk-consistency.service.ts`) are in the same position.
- **Business risk.** Silent divergence between representations is exactly the failure the dual-write design exists to catch, and nobody is watching. Divergence discovered by a donor or auditor rather than by the platform is a trust event.
- **Technical solution.** Schedule all reconciliation and parity checks nightly via `@nestjs/schedule` (already imported at `app.module.ts:56`), persist results, and alert on any non-zero divergence through the Phase 4 alerting channel. Surface a reconciliation status tile on the board dashboard. Once `ProjectTransaction` is fully retired per the Wave 8 plan, replace journal-vs-ledger reconciliation with ledger-internal invariants (every transaction balances; account balance equals the sum of its entries).
- **Files.** `apps/api/src/modules/treasury/treasury.service.ts:232`, `apps/api/src/modules/projects/fk-consistency.service.ts`, the three parity services, new scheduler, `apps/admin/src/app/(dashboard)/board/`.
- **Dependencies.** 4.2 (alerting).
- **Priority.** **P2** · **Complexity.** Medium · **Impact.** Turns a manual check into a continuous control.

---

## Phase 4 — Operational Reliability

> Currently 0/5. This phase is not optional for a system holding money.

### 4.1 — Backups and tested restore

- **Problem.** No backup exists anywhere in code or configuration — no `pg_dump`, no backup service in either compose file, no volume export, no pre-migration snapshot in `deploy.yml`. The project documents this honestly (`quide for project/BACKUP_RECOVERY.md:4,33`) but documentation is not implementation.
- **Business risk.** **Total, irrecoverable loss of all donation history, ledger data and audit trail** from a disk failure, a bad migration, a container mistake, or a `db:reset` (see 0.6). For a platform holding public and charitable funds this is an existential and likely legally negligent exposure.
- **Technical solution.** Backup sidecar performing scheduled `pg_dump` (daily full, plus WAL archiving for point-in-time recovery), encrypted at rest, replicated **off-host** to object storage in an EU region. Back up the `uploads` volume on the same schedule and keep the two consistent. Define and publish RPO and RTO. **Automate a monthly restore rehearsal into a scratch environment and fail the compliance check if it has not run** — an untested backup is not a backup. Add a pre-migration snapshot step to `deploy.yml` before `prisma migrate deploy`.
- **Files.** `docker-compose.prod.yml:98-100`, new `deploy/backup/`, `.github/workflows/deploy.yml:118`, new restore runbook.
- **Dependencies.** None. **Start this in parallel with Phase 0** — it has the longest lead time to *trustworthy* (a backup you have never restored is worthless) and the highest consequence.
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Removes the existential data-loss risk.

### 4.2 — Monitoring, alerting and structured logging

- **Problem.** No error tracking, no APM, no metrics, no log aggregation — searched `apps/api/src` and all `package.json` files for Sentry, Prometheus, OpenTelemetry, Datadog and New Relic: zero matches. Logging is `console`/Nest logger to stdout with no aggregation. `health.controller.ts:12-14` is liveness-only.
- **Business risk.** Nobody knows the system is failing until a user reports it. Critically, **a breach cannot be detected**, which makes the GDPR Article 33 72-hour notification duty impossible to meet and turns an incident into a compounding regulatory failure.
- **Technical solution.** Error tracking (Sentry or equivalent, EU-hosted) with PII scrubbing; structured JSON logging with a correlation id — `requestId` already flows through `ActorContextInterceptor` (`actor-context.interceptor.ts:22`), so end-to-end tracing is nearly free; metrics for request rate, latency, error rate, queue depth, DB pool; alerts on error-rate spikes, failed logins, queue backlog, reconciliation divergence (3.6), audit-write failures, and backup job failure. Add security-relevant alerting: repeated 403s from one identity, unusual export volume, `tenancy.bypassed` events (already emitted at `tenancy.repository.ts:155-163` and currently going nowhere).
- **Files.** `apps/api/src/main.ts`, `apps/api/src/common/filters/http-exception.filter.ts`, `apps/api/src/health/health.controller.ts`, `docker-compose.prod.yml`.
- **Dependencies.** None.
- **Priority.** **P0** · **Complexity.** Medium · **Impact.** Enables detection, containment and lawful breach notification.

### 4.3 — Deployment safety and rollback

- **Problem.** `.github/workflows/deploy.yml:84-90` pushes both `:latest` and `:sha` but `:113` pulls `latest` — the deployed artifact is a mutable tag, so what is running cannot be identified with certainty. Migrations run before the new containers start (`:118` then `:127`), so a failed migration leaves the old code against a new schema. There is no rollback path, no staging environment in CI, no smoke test beyond `curl` against a liveness endpoint (`:139`), and `sleep 15` as a readiness strategy.
- **Business risk.** A bad release cannot be reverted quickly and may leave the database in a state the previous version cannot read. Downtime during donation campaigns directly costs donations and trust.
- **Technical solution.** Deploy immutable `:sha` tags. Add a staging environment mirroring production, deployed first, with the e2e suite executed against it as a promotion gate. Adopt expand/contract migrations so every schema change is backwards-compatible with the previous release, making rollback safe. Replace `sleep` with readiness polling against `/api/ready` (2.7). Add an automated rollback on health-check failure. Take the pre-migration snapshot from 4.1.
- **Files.** `.github/workflows/deploy.yml:84-150`, `docker-compose.prod.yml:32,58,78`.
- **Dependencies.** 2.7 (readiness probe), 4.1 (snapshot).
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Makes releases reversible.

### 4.4 — Disaster recovery and incident response

- **Problem.** Single VPS, single database, single region (`docker-compose.prod.yml`). No DR plan, no defined RTO/RPO, no incident runbook, no on-call rotation.
- **Business risk.** Host loss is an extended outage of unknown duration with unknown data loss. Municipal and NGO contracts routinely require stated RTO/RPO and a tested DR plan.
- **Technical solution.** Define and publish RTO/RPO. Document and rehearse full recovery from backup into a clean host. Write incident runbooks for the top scenarios: database loss, host loss, credential compromise, payment-provider outage, personal data breach. Establish on-call and an escalation path. Consider managed Postgres with automated failover as an early upgrade — it retires a large amount of 4.1 and 4.4 in one step.
- **Files.** New `runbooks/`, deployment documentation.
- **Dependencies.** 4.1, 4.2.
- **Priority.** **P1** · **Complexity.** Medium · **Impact.** Converts an outage from an existential event into a managed one.

---

## Phase 5 — Enterprise Readiness

### 5.1 — Full data export and tenant offboarding

- **Problem.** Exports are per project, fund or organization only (`exports.controller.ts:45,58,71`; `reports.controller.ts:15-60`). No bulk export of donations, donors, expenses, ledger or audit log.
- **Business risk.** No exit path is a procurement blocker — public bodies require data portability guarantees before signing. It is also an operational risk for the platform when a customer leaves acrimoniously.
- **Technical solution.** `GET /api/v1/exports/full` (administrator) and an organization-scoped variant, streaming a ZIP of CSV/NDJSON per table, reusing `csv.util.ts:2`. Include a manifest with row counts and a checksum so the recipient can verify completeness. Audit every invocation.
- **Dependencies.** 1.4 (shared export machinery), 2.4 (serialization).
- **Priority.** **P2** · **Complexity.** Medium · **Impact.** Removes a procurement blocker.

### 5.2 — Outbound webhooks and integration surface

- **Problem.** Inbound payment webhooks are implemented well (`webhooks.controller.ts:19-39`, signature-verified at `stripe.service.ts:55-57` and `paypal.service.ts:69-104`). There is no outbound mechanism — the domain event bus (`event-bus.service.ts:53-146`) is in-process only.
- **Business risk.** Municipalities and larger NGOs need platform events in their own finance and ERP systems. Absent that, they either reject the platform or demand database access — which is far worse.
- **Technical solution.** Subscription model (endpoint URL, event filter, HMAC secret, per-tenant), a `'**'` subscriber alongside `audit.service.ts:23`, delivery through the existing Bull queue with exponential backoff, a dead-letter queue, and a customer-visible delivery log. Sign payloads and publish the verification recipe.
- **Dependencies.** 1.1 (outbox gives reliable delivery semantics for free).
- **Priority.** **P2** · **Complexity.** Medium · **Impact.** Unlocks larger institutional customers.

### 5.3 — European regulatory export formats

- **Problem.** No XML export exists — the audit marked E-2 not applicable because the code makes no such claim. Targeting European public-sector customers changes that: **SAF-T** (OECD XML, mandatory in Portugal, Norway, Poland, Lithuania and Romania) and **SEPA** payment/direct-debit files (pain.001 / pain.008) become expected rather than optional.
- **Business risk.** Without SAF-T the platform cannot serve customers in those jurisdictions. Without SEPA files, disbursements remain manual.
- **Technical solution.** Generate SAF-T from the ledger — the double-entry model at `treasury.service.ts` maps cleanly onto it, which is a real advantage of the existing design. Validate output against the official XSD in CI so conformance is proven, not assumed. Add SEPA credit-transfer file generation for expense disbursement.
- **Dependencies.** 3.4 (sequential numbering and period close are prerequisites for a valid SAF-T file), 3.5 (currency).
- **Priority.** **P2** · **Complexity.** Large · **Impact.** Opens five-plus EU markets.

### 5.4 — Enterprise authentication

- **Problem.** Local email/password only (`auth.service.ts`). No SSO, no MFA, no SCIM.
- **Business risk.** Municipal IT will not provision local passwords for staff; SSO is frequently a hard procurement requirement, and MFA is expected for any role touching money.
- **Technical solution.** OIDC/SAML federation per organization, with the existing `OrganizationMembership` and `RoleAssignment` model (`schema.prisma:1035-1088`) as the mapping target — the multi-tenant identity model is already the right shape. TOTP MFA for all administrative and financial roles, mandatory for `board_chair`, `fund_director` and `org_accountant`. SCIM provisioning later.
- **Dependencies.** 2.1.
- **Priority.** **P2** · **Complexity.** Large · **Impact.** Required for municipal and large-NGO segments.

### 5.5 — Test coverage and quality gates

- **Problem.** Zero tests in `apps/web` and `apps/admin`; no test script in either package. `apps/api/package.json:12` uses `--passWithNoTests`, so `pnpm test` reports success while covering no UI code. No coverage threshold configured.
- **Business risk.** The admin dashboard drives financial approvals with no automated verification. Regressions in approval flows reach production silently.
- **Technical solution.** Component and integration tests for the admin financial, audit and governance screens. Drop `--passWithNoTests`. Set a coverage floor on `apps/api/src/modules/{treasury,financial,policy,audit}` and ratchet it upward. Add the security regression suite from 2.3 to the required CI checks.
- **Dependencies.** None.
- **Priority.** **P2** · **Complexity.** Medium · **Impact.** Protects the financial paths from regression.

### 5.6 — Documentation, licence and trust artifacts

- **Problem.** `README.md:158` claims MIT with no `LICENSE` file and no `license` field in any of the five `package.json` files. Roughly 60 markdown files across four directories with no index of what is current; `README.md:8` contains stray text (`dfdfsfdsf`). No security policy, no public status page, no SLA.
- **Business risk.** An ambiguous licence is a procurement blocker on its own. Contradictory documentation slows onboarding and undermines credibility in technical due diligence.
- **Technical solution.** Add a root `LICENSE` with full MIT text and `"license": "MIT"` in `package.json`. Publish `SECURITY.md` with a disclosure policy and contact. Add `docs/README.md` indexing every document as current or historical; archive superseded roadmap material. Fix `README.md:8`. Produce a customer-facing trust page: security overview, sub-processor list, DPA, uptime commitment.
- **Dependencies.** 1.7.
- **Priority.** **P2** · **Complexity.** Small · **Impact.** Removes friction from every enterprise sales cycle.

### 5.7 — Independent assurance

- **Problem.** No external penetration test, no certification, no third-party assurance of any kind.
- **Business risk.** Enterprise and public-sector buyers increasingly require ISO 27001 or SOC 2 evidence, or at minimum a recent independent pen-test report.
- **Technical solution.** Commission a penetration test **after** Phases 0–2 land (testing before then wastes the engagement re-finding known issues). Begin ISO 27001 readiness — much of the evidence base is produced by Phases 1 and 4. Schedule an annual retest and add a bug-bounty or responsible-disclosure channel.
- **Dependencies.** Phases 0–2 complete.
- **Priority.** **P3** · **Complexity.** Medium · **Impact.** Converts security posture into sellable evidence.

---

## 3. Production Go / No-Go Checklist

**Every box must be checked before the first real user, real donor record, or real money enters the system.** Each is binary and independently verifiable — no partial credit.

### Security

- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` have no code fallback; the process refuses to boot without them *(0.1)*
- [ ] Boot-time config validation rejects a missing or weak secret, and rejects `POLICY_ENFORCED`/`TENANCY_ENFORCED` ≠ `true` *(0.1)*
- [ ] No credential, password or token is hardcoded in source; secret scanning runs in CI *(0.6, 2.5)*
- [ ] Seeds and destructive scripts refuse to run when `NODE_ENV=production` *(0.6)*
- [ ] All four seeded default accounts are removed or their passwords rotated in every environment *(0.7)*
- [ ] `ThrottlerGuard` is bound globally; login, register, activate-invite and forgot-password are demonstrably rate-limited by test *(0.2)*
- [ ] Every route resolves to an explicit authorization decision; no permissive fall-through *(2.3)*
- [ ] Object-level ownership enforced on every participant-reachable resource, proven by cross-participant e2e tests *(0.3, 2.2, 2.3)*
- [ ] No unauthenticated endpoint returns personal data *(0.4)*
- [ ] QR and all security tokens generated with a CSPRNG *(0.4)*
- [ ] Application connects to Postgres as a non-superuser, least-privilege role *(2.6)*
- [ ] TLS enforced end to end; HSTS enabled; production CORS allowlist contains no localhost origin *(2.7)*
- [ ] Independent penetration test completed with no open critical or high findings *(5.7)*

### Financial

- [ ] Ledger is append-only, enforced by database trigger and grants — not by application code alone *(1.3, 2.6, 3.2)*
- [ ] Reversing entries implemented, linked to the original, and the only supported correction path *(3.1)*
- [ ] No hard-delete path reaches any financial or governance record *(3.2)*
- [ ] Budgets have approval states and are immutable once approved *(3.3)*
- [ ] Reconciliation and parity jobs run on schedule and alert on any divergence *(3.6)*
- [ ] Reconciliation is green for 100% of projects across a 14-day soak *(3.6)*
- [ ] Reporting currency is explicit; no silent USD default for EUR customers *(3.5)*

### Compliance

- [ ] Audit rows are written in the same transaction as the mutation; a failed audit rolls back the change *(1.1)*
- [ ] Every mutating service path emits a domain event; the `require-actor-context` suppression count is zero *(1.2)*
- [ ] `audit_logs` cannot be updated, deleted or truncated by the application role, verified by test *(1.3)*
- [ ] Seeds, backfills and scheduled jobs write through the governed client and appear in the audit trail *(1.6)*
- [ ] GDPR subject access and portability export available and audited *(1.4)*
- [ ] Erasure mechanism implemented (crypto-shredding/pseudonymization) without breaking ledger integrity *(1.5)*
- [ ] Retention schedule defined per data class and enforced by a scheduled job *(1.5)*
- [ ] RoPA, DPIA, DPA template, sub-processor register and breach runbook completed and version-controlled *(1.7)*
- [ ] Data residency confirmed EU; SCCs in place for all non-EU processors *(1.7)*
- [ ] No PII in application logs; query logging disabled wherever real data exists *(1.7)*

### Infrastructure

- [ ] Automated, encrypted, off-host backups of database and uploads, running on schedule *(4.1)*
- [ ] **Restore rehearsed end to end into a clean environment, with the result recorded** *(4.1)*
- [ ] RPO and RTO defined, published and demonstrated by the rehearsal *(4.1, 4.4)*
- [ ] Pre-migration snapshot taken automatically on every production deploy *(4.1, 4.3)*
- [ ] Error tracking, metrics and log aggregation live, with PII scrubbing *(4.2)*
- [ ] Alerting configured for error spikes, failed logins, audit-write failure, reconciliation divergence, `tenancy.bypassed` events and backup failure *(4.2)*
- [ ] Readiness probe checks Postgres and Redis; CD gates on readiness, not liveness *(2.7, 4.3)*
- [ ] Deployments pin immutable image tags; rollback path documented and tested *(4.3)*
- [ ] Staging environment exists and the e2e suite gates promotion to production *(4.3)*
- [ ] Incident response runbooks written and on-call established *(4.4)*

### Commercial / Trust

- [ ] `LICENSE` file present; `license` field set in `package.json` *(5.6)*
- [ ] `SECURITY.md` with a disclosure channel published *(5.6)*
- [ ] Customer-facing DPA and sub-processor list available *(1.7, 5.6)*
- [ ] Documentation index distinguishes current from historical *(5.6)*

---

## 4. Fix Classification

### A) Must fix before the first customer

*Non-negotiable. The platform is unsafe or unlawful without these.*

| Item | Why it cannot wait |
|---|---|
| 0.1 Remove fallback JWT secrets + boot validation | Total authorization bypass |
| 0.2 Bind ThrottlerGuard | Brute-force, enumeration, mail bombing |
| 0.3 Donation object-level authorization | Active PII breach path |
| 0.4 QR token PII + CSPRNG | Unauthenticated PII disclosure |
| 0.5 File listing scoping | Document metadata enumeration |
| 0.6 Production guards on seeds and `db:reset` | Known credentials; total data loss |
| 0.7 Operational verification sweep | Determine whether a breach already occurred |
| 1.1 Transactional outbox for audit | Audit trail must be evidence, not assertion |
| 1.2 Close audit coverage gaps | Financial changes must be attributable |
| 1.3 Database-level audit immutability | Audit must survive application compromise |
| 1.4 GDPR subject access export | Legally required; one-month response duty |
| 1.6 Governed client for seeds and backfills | Largest audit-bypass surface |
| 1.7 GDPR governance artifacts | Cannot lawfully process EU personal data without them |
| 2.1 Enforcement flag burn-down | Silent security downgrade by omission |
| 2.2 Participant tenancy blind spot | Root cause of a recurring bug class |
| 2.3 Object-level authorization sweep | The permissive fall-through will keep producing 0.3-class holes |
| 2.5 Secret management | No rotation path means no incident recovery |
| 2.6 Least-privilege database role | Missing containment layer |
| 2.7 Transport, CORS, readiness probe | Transport gaps; deployment health is currently meaningless |
| 3.1 Reversing entries | Otherwise operators will edit the database directly |
| 3.2 Eliminate hard deletes | Governance and financial evidence is destroyable |
| 3.3 Budget lifecycle states | Spending authority has no approval record |
| 4.1 Backups + tested restore | Existential data-loss risk |
| 4.2 Monitoring and alerting | Cannot detect a breach; cannot meet the 72h duty |
| 4.3 Deployment safety and rollback | A bad release is currently unrecoverable |
| 4.4 DR plan and incident runbooks | Contractually required; outage otherwise unbounded |
| 5.6 LICENSE and trust artifacts | Trivial effort, hard procurement blocker |

### B) Can be fixed after launch

*Real gaps, but manageable with a documented mitigation and a committed date. Suitable for a design-partner or pilot launch with a small, informed customer set.*

| Item | Interim mitigation |
|---|---|
| 1.5 GDPR erasure via crypto-shredding | Manual, documented erasure procedure with a defined SLA; Article 17(3)(b) applied to financial records with the basis recorded |
| 2.4 Response serialization / field-level output | Rely on route-level authorization; audit PII-bearing exports manually |
| 3.4 Period close and sequential numbering | Manual period-end freeze procedure; blocks DE/FR/Nordic customers until delivered |
| 3.5 Multi-currency and FX | Launch single-currency (EUR) per tenant; no mixed-currency funds |
| 3.6 Automated reconciliation | Run the existing endpoint manually on a documented weekly cadence |
| 5.1 Full data export | Honour export requests manually against a documented SLA |
| 5.5 Frontend tests and coverage gates | Manual regression checklist for financial screens each release |
| 5.7 Penetration test | Schedule immediately after Phase 2; do not launch beyond a pilot without it |

### C) Nice-to-have enterprise features

*Growth and market-expansion work. Prioritise by the deals that actually require them — do not build speculatively.*

- 5.2 Outbound webhooks *(triggered by the first integration-hungry customer)*
- 5.3 SAF-T and SEPA export *(triggered by the first PT/NO/PL/LT/RO opportunity)*
- 5.4 SSO/SAML/OIDC + MFA + SCIM *(triggered by the first municipal deal — expect this early)*
- ISO 27001 / SOC 2 certification *(triggered by enterprise RFPs)*
- Public status page, published SLA, bug bounty
- Advanced transparency features: donor-facing money-trail visualisation, public API for researchers

---

## 5. Recommended Implementation Order

### Guiding sequencing rules

1. **Stop the bleeding first.** Phase 0 is one engineer-week and blocks everything else.
2. **Start the long-lead item on day one.** Backups (4.1) have the longest path to *trustworthy* because the restore rehearsal is the real deliverable. Begin in parallel with Phase 0.
3. **The outbox (1.1) is the keystone.** Audit coverage (1.2), governed scripts (1.6), reversing entries (3.1) and outbound webhooks (5.2) all get easier or become correct once it exists. Do it early and do it properly.
4. **Least privilege comes after the scripts are fixed.** 2.6 and 1.3 cannot land until 1.6 removes the scripts' need for superuser. Sequence: 1.6 → 1.3 + 2.6 together in one migration.
5. **Burn the flags before the pen test.** Testing a system whose security posture depends on an unset environment variable produces findings about the flag, not about the system.
6. **Compliance paperwork runs in parallel.** 1.7 is not engineering work; assign it to compliance on week one so it does not become the critical path in month four.

### Sequenced plan

**Week 1 — Emergency**
0.1 → 0.2 → 0.3, 0.4, 0.5 → 0.6 → 0.7. Kick off 4.1 (backup infrastructure) and 1.7 (compliance artifacts) in parallel. **Gate: no production traffic until 0.1–0.7 are closed and verified.**

**Weeks 2–5 — Audit becomes evidence**
1.1 transactional outbox → 1.2 audit coverage → 1.6 governed client for scripts → 1.3 + 2.6 as a single migration (immutability trigger + least-privilege roles). Complete 4.1 including the **first successful restore rehearsal**. Start 4.2 monitoring.

**Weeks 6–9 — Security hardening**
2.1 flag burn-down → 2.2 participant tenancy fix → 2.3 authorization sweep with deny-by-default → 2.5 secret management → 2.7 transport/CORS/readiness. Finish 4.2; add 4.3 deployment safety. Complete 1.4 GDPR subject export.

**Weeks 10–14 — Financial maturity**
3.1 reversing entries → 3.2 eliminate hard deletes → 3.3 budget states → 3.6 scheduled reconciliation. Complete 4.4 DR and runbooks. Finish 1.7 compliance pack. Add 5.6 licence and trust artifacts.

**Week 15 — Assurance gate**
Commission the penetration test (5.7). Walk the Go/No-Go checklist formally with engineering, security and compliance signing jointly. Remediate findings.

**Weeks 16+ — Launch and expand**
Pilot launch with informed design partners under the Section B mitigations. Then, demand-driven: 1.5 erasure, 3.4 period close, 3.5 multi-currency, 5.4 SSO, 5.3 SAF-T, 5.1 full export, 5.2 webhooks, 2.4 serialization, 5.5 frontend tests.

### Parallelisation

| Track | Owner | Runs |
|---|---|---|
| Application security | Backend + security | Weeks 1–9 |
| Compliance and legal | Compliance lead | Weeks 1–14 (off the critical path) |
| Infrastructure and operations | DevOps/SRE | Weeks 1–13 |
| Financial domain | Backend + finance SME | Weeks 10–14 |

### What not to do

- **Do not rewrite.** The ledger, workflow engine, policy registry and event bus are the platform's most valuable assets. Every item above is additive hardening of existing structures.
- **Do not delete the Wave 0–9 migration machinery until its parity jobs are green.** The dual-write and reconciliation discipline is what makes 2.1's flag removal safe.
- **Do not launch on the Phase 0 fixes alone.** They stop active exploitation; they do not make the system trustworthy. Phases 1, 2 and 4 are what a European customer is actually buying.
- **Do not defer the restore rehearsal.** A backup that has never been restored is a belief, not a control.

---

*Prepared from `COMPLIANCE_AUDIT.md`. Every problem statement traces to a `path:line` reference in that report or to verification performed during its preparation. Effort estimates assume a team already familiar with this codebase and should be re-baselined by the engineers who will do the work.*
