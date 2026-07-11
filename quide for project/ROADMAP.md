# Roadmap

> **Audience:** Project sponsors, delivery team, technical leads.
> **Source:** This is a clean rewrite of `workspaceroadmap/PROGRESS.md`, `workspaceroadmap/PILOT_READINESS.md`, `workspaceroadmap/backlog/BACKLOG_BUGS.md`, and `workspaceroadmap/19_WAVE_8_FINAL_CONSOLIDATION.md`. **No new items have been invented** — every line below traces to one of those source documents. Where this document summarizes, `CHANGELOG.md` has the full detail per wave.

---

## Completed

Waves 0 through 7 — all epics implemented, verified against a full regression suite (365 e2e across 35 suites + 82 unit tests, flags both OFF and ON), and currently in **soak/verification** (🟡), not yet fully closed out operationally. See `CHANGELOG.md` for what each wave delivered.

| Wave | Delivered |
|---|---|
| 0 — Foundations | Audit log, soft delete (code-complete, not yet flag-enforced in production), event bus, `ActorContext`, the regression suite itself |
| 1 — Identity & Multi-Tenancy | Organizations, scoped role grants, policy engine (now enforced, not just shadow) |
| 2 — Organizations | Multi-org workspaces live, D1/D2 structural-debt repairs, tenancy isolation enforced by default |
| 3 — Governance Board | Board decisions, generalized voting, review queue |
| 4 — Workflow Engine | Lifecycle-as-data, `project-lifecycle` v1 parity-verified against the legacy behavior it replaced |
| 5 — Treasury & Funds | Double-entry ledger, funds, allocation lifecycle, fund officer segregation of duties |
| 6 — Municipal Integration | Joint projects, funding agreements, organization reporting, civic category taxonomy, `project-lifecycle` v2, emergency-relief |
| 7 — Reporting & Transparency | Public transparency portal, Board/org dashboards, CSV exports, Board-controlled publication policy |

Also completed: the **Pilot Release Readiness — Consolidation Pass** (2026-07-10), which fixed 4 blocker bugs found by the regression suite (BUG-1, 8, 9, 11) and reconfirmed 2 earlier fixes (BUG-6, BUG-10) live on the deployed stack. This pass is distinct from the not-yet-started formal Wave 8 (see Future, below).

---

## In Progress (soak / pending operational steps)

Each Wave 0–7 item below is **code-complete** but has an operational step still pending before it can be considered fully closed. These are carried over verbatim from each wave's row in `workspaceroadmap/PROGRESS.md`.

- **Wave 0:** mark `e2e-regression-suite` required in GitHub branch protection; deploy to staging with `SOFT_DELETE_ENFORCED=true` for a 1-week soak; then a production flip + Definition-of-Done sign-off.
- **Wave 1:** 2 production weeks of policy-engine shadow-mode observation (chained to the Wave 0 soak).
- **Wave 2:** staging/production deploy carrying the new tenancy defaults (`TENANCY_ENFORCED`/`POLICY_ENFORCED` = true).
- **Wave 3:** staging/production deploy + a governance backfill rehearsal.
- **Wave 4:** staging backfill rehearsal + a per-service flag rollout with its own soak period (using `WORKFLOW_SERVICES` to narrow the cutover one service at a time).
- **Wave 5:** production backfill + reconciliation soak; the **first production allocation cycle**, observed end-to-end; stopping the treasury dual-write only after a reader soak confirms nothing still depends on the legacy journal.
- **Wave 6:** a **real municipality onboarded through the pilot program**, with Board sign-off, before flipping `ORG_SELF_REGISTRATION` from `allowlist` to `open`; a production category-backfill rehearsal.
- **Wave 7:** Board review and sign-off on the publication policy **before** publicly announcing the transparency portal; a read replica, deferred until real load actually demands it (not currently needed).

---

## Future

### Wave 8 — Final Consolidation (not started)

**Hard precondition, per the wave's own plan:** all Wave 0–7 Definitions of Done met, and every nightly parity/consistency job green for an agreed **30-day quiet period** — this wave has not started because that quiet-period clock has not yet been started, let alone completed.

What it will do, when it starts (the "contract" phase — this is the *only* wave allowed to drop/rename/repurpose anything):

- Remove every dual-write and every migration feature flag (`SOFT_DELETE_ENFORCED`, `TENANCY_ENFORCED`, `POLICY_ENFORCED`, `WORKFLOW_ENFORCED`/`WORKFLOW_SERVICES`, `TREASURY_LEDGER_READS`) and delete the dormant legacy enforcement code they guard (e.g. `RolesGuard` once `PolicyGuard` has been the sole enforcer long enough).
- Close all five structural debts (see Technical Debt, below) by dropping the legacy columns/enums each one left behind.
- Drop the frozen `StudyVote` and `ProjectTransaction` tables — **only after** archiving their contents (they are historical financial/vote records; archived, never simply destroyed).
- Add PostgreSQL Row-Level Security on organization-owned tables as a database-level tenancy backstop, shipped in permissive/log mode first and only enforced after a soak window shows zero violations.
- Add database-level grants so the application's DB role loses UPDATE/DELETE on every table that's supposed to be immutable (`AuditLog`, `LedgerTransaction`, `LedgerEntry`, `Vote`, `BoardDecision`, `WorkflowStepLog`) — immutability enforced by the database itself, not just application convention.
- Squash `packages/database`'s migration history (git history stays linear/intact) and rewrite the seed script to the final model with no legacy writes.
- Batched execution: one legacy item (or coherent group) per deploy — census evidence → snapshot → drop → full regression + parity re-run → next item. Explicitly **not** a big-bang drop day.

---

## Technical Debt

### Structural debt (D1–D5) — tracked since Wave 0's system analysis

All five are **repaired** (a working additive fix exists and is in use) but not yet **closed** (the legacy representation each one left behind is still present in the schema, pending Wave 8).

| ID | Debt | Repaired in | Closes in |
|---|---|---|---|
| D1 | Execution/financial tables FK to `Block`, not `Project` | Wave 2 | Wave 8 |
| D2 | Assignees/creators FK to `Admin`, not `User` | Wave 2 | Wave 8 |
| D3 | Lifecycle states as hardcoded enums | Wave 4 | Wave 8 |
| D4 | Cascade deletes / no audit trail | Wave 0 | Wave 0 (code done; `SOFT_DELETE_ENFORCED` production flip still pending — see In Progress) |
| D5 | Global 3-value role enum | Wave 1 | Wave 8 |

### Open bugs (from `workspaceroadmap/backlog/BACKLOG_BUGS.md`)

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-2 | Pilot-blocking | `ThrottlerGuard` is configured but not registered as a global guard — login/forgot-password are not actually rate-limited despite `@Throttle()` decorators being present. | **Open** — explicitly called out as a required fix before any pilot exposure. |
| BUG-3 | Low | `WebhookLog.processedAt` is never set (a Prisma `Json` filter bug swallowed by a try/catch) — payment dedupe is unaffected, but the processed/unprocessed distinction the column exists for is lost. | Open, no urgency. |
| BUG-4 | Low/moderate | An invalid Stripe webhook signature returns 500 instead of 400, polluting error monitoring. | Open. |
| BUG-5 | Moderate | The Financial module (budgets/expenses/transactions) doesn't enforce financial-officer project assignment the way Donations does — any financial officer can currently act on any project's financial data. | Open — candidate to fold into a future RBAC-finishing pass. |
| BUG-7 | Large | `User.adminId`/`User.participantId` are never populated on write, so those relations are always null — participants cannot edit their own profile, and donation-approval emails are silently skipped. | Open — needs a backfill migration + a write-path fix. |
| FLAKE-1 | Test infra | The e2e suite intermittently reports one suite as failed (all its individual tests actually pass) roughly 1 run in 5 — suspected Bull/Redis teardown handle issue. | Open, not yet reproduced with a capturable log. |

### Documentation debt (found while writing this documentation package)

- Four separate setup docs (`docs/07-local-setup.md`, `docs/08-docker.md`, `LOCAL_SETUP.md`, `DEV_TEAM_SETUP.md`, `TEAM_SETUP.md`) disagree with each other and with the actual configuration about which port the public website runs on (they say 3000 or 3002; it is actually **3200** per `docker-compose.yml` and `apps/web/package.json`). Needs a correction pass.
- `docs/09-production.md`'s Nginx example and seed instructions reference the wrong port and a non-existent compiled seed script respectively.
- `.env.example` documents `WORKFLOW_SERVICES` and `INTERNAL_API_URL` only in prose comments, not as actual (even if commented-out) settable keys.
- The workflow seed file's header comment ("all other definitions ship authored but inactive") is stale — every definition in the array is currently `isActive: true`.

---

## Operational Tasks

Recorded as open items in `workspaceroadmap/PILOT_READINESS.md`, not yet done as of this writing:

- **Secrets rotation** — `.env` still ships placeholder values (`JWT_SECRET=your-super-secret…`, Postgres password `password`, `SMTP_PASS` placeholder, Stripe `sk_test_...`). Anyone who knows the public defaults can forge tokens today. Must be rotated per-environment before any exposure beyond a fully controlled test environment.
- **Auth rate limiting** — see BUG-2 above. Recommended interim mitigation: rate-limit `/api/v1/auth/*` at the ingress/reverse-proxy layer (e.g. Nginx `limit_req`) while the application-level fix (which needs its own test-environment exemption) is scheduled.
- **SMTP configuration** — invitation and password-reset emails currently fail to send (a live SMTP 535 was observed during testing). The on-screen fallback link this environment relies on is disabled once running in production mode — meaning **organization onboarding and password reset are functionally broken in production without working SMTP.**
- **TLS + real domains** — CORS origins and every `*_URL` environment variable currently point at `localhost`; must be set to real pilot domains behind HTTPS before go-live (auth tokens live in `localStorage`, which makes plain-HTTP exposure a real risk, not just a formality).
- **Branch protection** — mark the `e2e-regression-suite` CI check as required on `main` (a Wave 0 leftover item, still open).
- **Backups** — no backup job exists yet for the `pgdata` or `uploads` volumes; set up a nightly `pg_dump` and an uploads sync before real data enters the system. See `BACKUP_RECOVERY.md` for the manual procedure to automate.
- **Error monitoring / log aggregation** — none configured; recommended for at least pilot week 1, even if it starts as something as simple as a documented log-tail runbook.
- **Repo hygiene** — `tarek.html`, `txt.txt`, and `EXTENSION_PROMPT.md` still sit at the repository root (confirmed present as of this writing); cosmetic, but flagged for deletion before tagging a pilot release.

---

## Pilot Tasks

Required sign-offs before pilot, per `workspaceroadmap/PILOT_READINESS.md` §4:

- **Board publication-policy review** of the 9 seeded field classes, before the public transparency portal is announced (the Board Dashboard tab is the review screen for this).
- **Pilot municipality onboarded through the allowlist** (`ORG_SELF_REGISTRATION=allowlist` + a populated `ORG_REGISTRATION_ALLOWLIST`) — keep the flag at `allowlist`, not `open`, until this is done and the Board has signed off.
- **Production backfill rehearsals on a copy of real data** — specifically, the Wave 5 treasury reconciliation gate and the Wave 6 category-coverage gate must both pass against real data before any production migration.
- **First production allocation cycle observed end-to-end** — propose → Board-approve → disburse → reconcile → close, watched live at least once before trusting the flow unattended.

---

## Production Tasks

Items that follow pilot completion, extrapolated only from what's already recorded as pending in the source documents (not invented):

- Flip `ORG_SELF_REGISTRATION` to `open` once the pilot municipality has gone through successfully and the Board has signed off (per Wave 6's pending-ops note).
- Retire the treasury dual-write to `ProjectTransaction` once a reader soak confirms nothing still depends on the legacy journal (Wave 5's pending-ops note).
- Begin the Wave 8 Final Consolidation 30-day quiet period once all Wave 0–7 soak items above are complete, then execute Wave 8 itself (batched, one item per deploy — see Future, above).
- Everything under **Operational Tasks** above must be resolved, not merely scheduled, before this system carries real financial or personal data in production — several of them (secrets rotation, SMTP, TLS) are described in the source documents as things that must happen, not optional hardening.

---

## Related documents
- `CHANGELOG.md` — full detail on what each completed wave actually delivered.
- `SYSTEM_ARCHITECTURE.md` §10 — the technical detail behind several Technical Debt and Operational Task items above (health checks, CD pipeline, RLS).
- `ADMIN_ACCEPTANCE_TEST.md` §22 — the release sign-off checklist that operationalizes several items on this roadmap.
