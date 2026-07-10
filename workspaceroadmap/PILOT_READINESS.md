# Pilot Release Readiness — Consolidation Pass (2026-07-10)

Scope of this pass: verification + blocker fixes only. No new features, no refactors.
Evidence for every ✅ was produced on this date against the working tree at this commit.

---

## 1. Verification results (raw)

| Check | Result |
|---|---|
| E2E regression | **365 passed / 365, 35 suites / 35** (220s, fresh test DB) |
| Unit tests | **82 passed / 82, 6 suites** |
| Custom lint rules (actor-context, unscoped-reads, status-writes, ledger-writes) | 0 errors |
| TypeScript (`tsc --noEmit`) | clean |
| Builds: api (nest), admin (next), web (next) | all ok |
| Migrations on a **fresh database** (`prisma migrate deploy`) | all 23 apply cleanly |
| Seed on fresh DB | all gates exact (W3 tally verification, W4 census/derivation, W5 ledger reconciliation, W6 category coverage, W7 policy defaults) |
| Docker **clean start** (`down -v` → fresh volumes) | all 5 containers healthy; 4 seeded logins 200; public API + web + admin serving |
| Load (public endpoints, live stack) | p50 4.2ms / p95 9ms; per-IP limiter absorbs single-source floods; ops latency unchanged under load |

**Deploy runbook (verified on clean volumes):**
1. `docker compose up -d postgres redis` (wait healthy)
2. `cd packages/database && npx prisma migrate deploy && pnpm run db:seed`
3. `docker compose up -d api admin web`
4. Smoke: login the four seeded accounts; `GET /api/v1/transparency/stats` → 200.

Note: the API container does **not** self-migrate — step 2 is a required operator step on every deploy carrying migrations.

## 2. Blockers fixed in this pass

| Bug | Was | Fix | Proof |
|---|---|---|---|
| BUG-9 | Dashboard endpoints unrestricted — any participant could list `recent-donations` platform-wide **with donor names + amounts** | Staff-only `@Roles` at controller level | auth-matrix row flipped; live probe 403 |
| BUG-8 | `GET /study/:id` unrestricted — drafts/rejection reasons/unpublished sections readable by participants; **bypassed the W7 beneficiary redaction** | Staff-only `@Roles`; public read remains the redacted by-project route | pinned test flipped; live probe 403 |
| BUG-11 | Any participant could read any other participant's profile + donation history | Self-scope: foreign ids read as 404 | pinned test flipped; live probe 404 |
| BUG-1 | `study_approved` notifications crashed on an invalid Prisma query — voters/donors never notified | Single nested `select` | suite green, no processor errors |

Also verified fixed earlier (confirmed live this pass): BUG-6 (refresh flow), BUG-10 (same-second login collision — two parallel logins both 200).

## 3. REMAINING BLOCKERS — must be resolved before pilot exposure

These are configuration/ops blockers, not code defects. **Do not expose the stack publicly until all four are done.**

- [ ] **Secrets are placeholders.** `.env` ships `JWT_SECRET=your-super-secret…`, `JWT_REFRESH_SECRET` likewise, Postgres password `password`, `SMTP_PASS` placeholder, Stripe keys `sk_test_...`. Anyone knowing the default can forge tokens. Generate strong per-environment secrets; rotate on leak; never commit.
- [ ] **No auth rate limiting (BUG-2).** `ThrottlerGuard` is enforced only on the W7 public transparency surface; login/forgot-password are unthrottled (brute-force). Recommended for pilot: rate-limit at the ingress proxy (nginx `limit_req` on `/api/v1/auth/*`); app-level enablement needs its own change (test-env exemption) per the BUG-2 note.
- [ ] **SMTP not configured.** Invitation/reset emails fail live (SMTP 535 observed). In production the dev fallback (activation link in the response) is disabled — **org onboarding and password reset are broken without working SMTP.**
- [ ] **TLS + domains.** CORS origins and `APP_URL/WEB_URL/ADMIN_URL/PAYMENT_*_URL` are localhost; must be set to the pilot domains behind HTTPS (tokens in `localStorage` — do not serve over plain HTTP).

## 4. Required ops sign-offs before pilot (accumulated wave tails)

- [ ] Board **publication-policy review** of the 9 field classes before announcing the public portal (W7-E5-S2; the Board → Dashboard tab is the review screen).
- [ ] Pilot municipality onboarded through the **allowlist** (`ORG_SELF_REGISTRATION=allowlist` + `ORG_REGISTRATION_ALLOWLIST`); keep `open` OFF until Board sign-off (W6-E7-S2).
- [ ] Production backfill rehearsals on a copy: W5 treasury reconciliation gate + W6 category coverage gate must pass against real data before migrating production.
- [ ] Mark `e2e-regression-suite` required in branch protection (W0-E5 leftover).
- [ ] First production allocation cycle observed end-to-end; dual-write retirement stays a Wave 8 item after reader soak.

## 5. Known accepted gaps (documented, not blocking pilot)

| Item | Risk | Disposition |
|---|---|---|
| BUG-7: `User.adminId/participantId` never populated → participants cannot edit own profile; donation-approval emails silently skipped | UX gap, no security impact | Needs backfill migration + write-path fix; schedule with BUG-11 follow-up (own story) |
| BUG-5: within one org, any financial officer can act on any of that org's projects (assignment ignored) | Mitigated by W2 org scoping + ledger audit trail | Fold into W8 RBAC finishing |
| BUG-3: `WebhookLog.processedAt` never set | Ops hygiene only (dedupe unaffected) | Small fix, any time |
| BUG-4: invalid Stripe signature → 500 not 400 | Monitoring noise | Small fix, any time |
| FLAKE-1: rare suite-teardown failure (~1/5 runs, tests all pass) | Test infra only | Investigate on next reproduction |
| QR donation lookups are public capability-URLs (32-char random tokens) | By design (physical QR flow) | Acceptable; entropy adequate |
| Legacy enum columns / dual-writes / `WORKFLOW_ENFORCED`-family flags | None while flags stay in shipped positions | Removal is Wave 8 proper (30-day quiet period gate) |
| Repo hygiene: `tarek.html`, `txt.txt`, `EXTENSION_PROMPT.md` at repo root | Cosmetic | Delete before tagging the pilot release |
| No error monitoring / log aggregation configured | Slower incident response | Recommended for pilot week 1 (even a log-file tail runbook) |
| Backups: `pgdata` and `uploads` volumes have no backup job | Data-loss risk | Set nightly `pg_dump` + uploads sync before real data enters |

## 6. Boundary audit summary (2026-07-10, live stack, flags ON)

- Anonymous → 401 on every workspace surface probed (orgs, audit, funds, dashboards, report queue, policy, workspace exports).
- Employee (org staff) → 403 on all governance/Board/fund-manage/publication-policy surfaces (8/8 probes).
- Participant → 403 on admin surfaces; dashboard + study-by-id + foreign-profile leaks **closed this pass** (§2).
- Cross-org isolation: permanent A/B suites green (`w2-tenancy-leak`, `w2-tenancy-isolation`); joint-project grants confine to exactly one project (`w6-municipal` leak test).
- Public surface inventory reviewed — every `@Public()` route is intentional: auth flows, signed webhooks, public content reads, token-gated QR, W6 registration (flag-gated), W7 read-only transparency (rate-limited, policy-gated).
- Privacy: donor identity and beneficiary data hard-excluded from all public output (`w7-transparency` probes, permanent).
- Board bypass reads remain audited events; fund officer segregation-of-duties matrix green (`w5-funds`).
