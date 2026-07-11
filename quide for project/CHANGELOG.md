# Changelog — Waves 0 through 7

> **Audience:** Developers, technical leads, auditors tracing how the system reached its current state.
> **Source:** `workspaceroadmap/PROGRESS.md` (execution status) cross-checked against `workspaceroadmap/11_WAVE_0_FOUNDATIONS.md` through `19_WAVE_8_FINAL_CONSOLIDATION.md` (the plan each wave executed) and the Prisma schema/migration history.
> **Status convention:** 🟡 = all epics implemented, in soak/verification (production rollout of some flags still pending). ⬜ = not started. As of this writing, Waves 0–7 are 🟡 and Wave 8 is ⬜ — see `ROADMAP.md` for what "in soak" means operationally.

---

## Wave 0 — Foundations
**Status:** 🟡 · Started 2026-07-07

**Purpose:** Make every later wave low-risk by establishing safety infrastructure first: an audit trail, soft deletes, a domain event bus, and a regression suite that pins current behavior before anything changes.

**Features delivered:**
- Append-only `AuditLog`, written by a subscriber reacting to domain events (never called directly by business logic — "audit is a subscriber, not a call site").
- Admin-facing audit viewer.
- Soft-delete convention (`deletedAt`/`deletedBy`) for new tables, flag-gated (`SOFT_DELETE_ENFORCED`, currently OFF pending a staging soak).
- In-process domain event bus (typed events, synchronous audit subscriber, async-capable notification subscriber).
- `ActorContext { userId, activeOrgId, roleAssignments, requestId }` introduced as the first argument to mutating service methods.
- 215 e2e + 51 unit tests established as the regression baseline (grew every wave after — 365 e2e / 82 unit by Wave 7).

**Architecture changes:** Introduced the "no cross-module Prisma access" module-boundary discipline and the event-subscriber pattern used by every subsequent wave (Treasury, Audit, Notifications).

**Database changes:** `audit_logs` table added. `deletedAt`/`deletedBy` columns begin appearing on new tables from this wave forward.

**Breaking changes:** None (additive only, per the Wave 0–7 "expand only" rule).

**Migration notes:** 35 legacy service methods remain grandfathered without `ActorContext` (lint ratchet actively tracking this down). Production flip of `SOFT_DELETE_ENFORCED=true` is a pending operational step, not a code gap.

---

## Wave 1 — Identity & Multi-Tenancy
**Status:** 🟡 · Started 2026-07-08

**Purpose:** Establish organizations and scoped role grants as the substrate every later wave (Board, Funds, Municipalities) builds on — without breaking the existing single-tenant behavior.

**Features delivered:**
- `Organization` / `OrganizationMembership` / `RoleAssignment` tables and the scoped role catalog (`platform | organization | fund | project`).
- Organizations module (admin-only at this stage; multi-org workspace UI lands Wave 2).
- Idempotent backfill: default organization + Board organization + memberships + role grants, derived from existing `AdminRole` values.
- Policy engine introduced **in shadow mode**: runs beside the legacy `RolesGuard`, logging agreement/divergence, never blocking.
- `activeOrgId` JWT claim + token v2; refresh-flow bug (BUG-6) fixed as part of this work.
- Dark (unused in production paths yet) `TenancyRepository`; admins dual-write to both old and new representations.
- 234 e2e + 81 unit tests, flags-OFF suite green.

**Architecture changes:** Introduced the two-guard chain (`PolicyGuard` alongside `RolesGuard`) and the legacy→scoped role translation table that lets old accounts work unchanged under the new model.

**Database changes:** `organizations`, `organization_memberships`, `role_assignments` tables added.

**Breaking changes:** None — this wave is explicitly "shadow mode," changing no enforced behavior.

**Migration notes:** Shadow-mode divergence monitoring was required to run 2 full production weeks before Wave 2 could flip enforcement on. `AdminRole` becomes derived-only after this backfill (writes to it are lint-forbidden going forward) but the column itself isn't dropped until Wave 8.

---

## Wave 2 — Organizations
**Status:** 🟡 · Started 2026-07-08 · **Isolation completed 2026-07-08**

**Purpose:** Make multi-organization data isolation real and repair the two oldest structural debts (D1: execution/financial tables FK to `Block` instead of `Project`; D2: assignees FK to `Admin` instead of `User`).

**Features delivered:**
- D1 repair: `projectRefId` added to all 7 execution/financial tables (steps, phases, tasks, budgets, expenses, transactions, milestones), backfilled and verified, dual-written, readers cut over.
- D2 repair: `*UserId` twins added alongside legacy `Admin`-FK assignee/creator columns, enabling non-admin (organization staff) assignees for the first time.
- Tenancy enforcement behind `TENANCY_ENFORCED` (permanent two-org isolation leak test added; Board bypass made audited; unscoped-read lint rule added).
- `POLICY_ENFORCED` flip, with a documented one-flag rollback.
- Organization Workspace shell in `apps/admin`: context picker/switcher, org+role management screens, a Board placeholder.
- Manual onboarding + invite flow.
- Tenant filtering extended across donations, online donations, studies/sections/votes, dashboard, reports, participants; creation ownership now always derives from `ActorContext.activeOrgId` (no `organizationId` field on any create DTO — closes a data-integrity finding).
- Refresh-token same-second collision fixed (`jti` added — BUG-10).
- 268 e2e + 81 unit tests (flags OFF and ON).

**Architecture changes:** `TENANCY_ENFORCED` and `POLICY_ENFORCED` became **default ON** in `.env`/`.env.example` starting this wave — the single biggest behavior change in the whole program, rolled out with a one-flag rollback path.

**Database changes:** `project_ref_id` columns (7 tables), `*_user_id` twin columns (multiple tables).

**Breaking changes:** None to external API contracts; internally, unscoped Prisma queries against org-owned tables now fail CI lint.

**Migration notes:** Study governance transitions remained gated on the legacy enum role through this wave (closed in Wave 3/8). Content blocks/languages remained platform-shared (deliberately deferred to Wave 6 CMS scope — organization admins holding the `employee`-mapped role could still see content nav at this point).

---

## Wave 3 — Governance Board
**Status:** 🟡 · Started 2026-07-08

**Purpose:** Replace the "administrator = unaccountable superuser" model with a real, decision-logged Board: immutable decisions with mandatory rationale, and voting generalized beyond studies.

**Features delivered:**
- Governance schema: `BoardDecision`, `VoteRound`, `Vote` (all immutable by convention).
- Governance module: decision recording with mandatory rationale, round lifecycle (eligibility + quorum/threshold rules as data), cross-org review queue, board-role policy gating.
- `StudyVote` → `VoteRound` backfill (tally-verified against the seed), voting module cut over; `StudyVote` frozen (create/update blocked by a Prisma middleware, not just convention).
- Study approve/reject now routes through governance with legacy-sync (new → old direction only) plus a nightly decision-parity job.
- `changes_requested` revision path, with rationale visible to the owning organization.
- Round-scoped reminders.
- Board workspace UI: Queue / Decide / History.
- Admin app split into three workspaces this wave: Organization Workspace (`/org/*`, its own layout/nav/dashboard — platform pages never mount for org members) and Platform Workspace (unchanged for platform-grant holders, including `/board`).
- 277 e2e + 81 unit tests; permanent governance-cycle spec (9 tests) added.

**Architecture changes:** The Board became modeled as `Organization(type=board)` with platform-scope role grants for its members — no parallel "board admin" subsystem, reusing the Wave 1/2 organization/membership machinery.

**Database changes:** `board_decisions`, `vote_rounds`, `votes` tables added.

**Breaking changes:** None. `StudyVote` remains readable (frozen, not dropped) until Wave 8.

**Migration notes:** Enum-gated governance transitions were retained specifically as a flags-off rollback path (closed alongside D5 in Wave 8).

---

## Wave 4 — Workflow Engine
**Status:** 🟡 · Started 2026-07-09

**Purpose:** Turn hardcoded lifecycle enums (D3) into a versioned, table-driven state machine, so new flows (municipal variants, emergency fast-track) become configuration rather than code + migration.

**Features delivered:**
- Engine tables + a three-operation `workflow` module: `start`, `availableTransitions`, `execute` — the last atomic (row-locked, guards re-checked, state moved, step log written, effects emitted, all in one transaction).
- `project-lifecycle` v1 transcribed 1:1 from the legacy `StudyStatus` machine, seeded with a census/backfill and hard verification.
- Parity harness (`w4-parity`) proving identical legacy event sequences and responses with the engine driving instead of the old service logic.
- Cutovers behind `WORKFLOW_ENFORCED` (+ staging-only `WORKFLOW_SERVICES` narrowing): study, voting auto-close, board decisions, donations gate, funding closure. Vote rounds now created by a `vote_round.create` effect rather than ad hoc service code.
- Dual-write bridge (engine → legacy enum columns) + nightly `WorkflowParityService` + a `no-direct-status-writes` lint rule.
- Admin UI: lifecycle timeline with `availableTransitions`-driven buttons (both workspaces), plus a read-only definition viewer.
- `project-lifecycle` v2, `emergency-relief`, `org-verification`, and `fund-allocation` definitions authored this wave but seeded **inactive** at the time — activated in later waves (see Waves 5 and 6 below; as of this writing, all are `isActive: true` in the seed).
- 305 e2e + 81 unit tests (flags OFF and ON).

**Architecture changes:** "Workflow Engine owns lifecycle state" became an enforced ownership rule (`SYSTEM_ARCHITECTURE.md` §3) — services stopped flipping status columns directly and started calling `execute()`.

**Database changes:** `workflow_definitions`, `workflow_states`, `workflow_transitions`, `workflow_instances`, `workflow_step_logs` tables added.

**Breaking changes:** None — v1 was built specifically to change no observable behavior (verified by the parity harness).

**Migration notes:** D3 marked "repaired" this wave (dual-write until Wave 8 closes it). Staging backfill rehearsal and per-service flag rollout with soak were left as pending ops at the time.

---

## Wave 5 — Treasury & Funds
**Status:** 🟡 · Started 2026-07-09

**Purpose:** Replace the mutable per-project transaction journal with a real double-entry ledger, and introduce pooled Funds with governed allocation to projects.

**Features delivered:**
- Double-entry ledger: `Account`, `LedgerTransaction`, `LedgerEntry` — immutable, Treasury the sole writer (lint-enforced).
- Idempotent posting API keyed on `(referenceType, referenceId, event)`.
- Money-event routing: QR donation approval, payment-webhook completion (replay-safe), expense approval — all with awaited effect emission.
- Legacy `ProjectTransaction` **FROZEN** + a treasury dual-write bridge; `TREASURY_LEDGER_READS` cutover flag added for reads.
- Accounts + ledger backfill with a hard reconciliation gate (allocations are ledger-native from birth — excluded from the backfill by definition, not a gap).
- Funds module: Board CRUD, the five fund-officer roles with fund-scope permissions, structural segregation of duties (the `fund_controller` role is read + flag only — enforced by a permanent matrix spec, not convention).
- `fund-allocation` workflow **activated**, with a launch ceiling requiring a `BoardDecision` per allocation.
- Fund-directed online donations (a donation can target a fund directly, not only a project).
- 3 initial funds seeded (Development & Infrastructure, Social Support, Relief & Emergency).
- `/funds` dashboard UI.
- 335 e2e + 81 unit tests.

**Architecture changes:** "Treasury owns money" became an enforced ownership rule — every other money-touching module (donations, payments, funds, financial) now emits events instead of writing ledger rows itself.

**Database changes:** `funds`, `fund_memberships`, `accounts`, `ledger_transactions`, `ledger_entries`, `fund_allocations` tables added.

**Breaking changes:** None to existing donation/payment endpoints or UX — donors and staff "notice nothing," per the wave's own design goal; the only change is what happens internally after approval/completion.

**Migration notes:** Production backfill + reconciliation soak, the first production allocation cycle, and stopping the dual-write (after reader soak) were left as pending ops.

---

## Wave 6 — Municipal Integration
**Status:** 🟡 · Started 2026-07-10 · Largest single wave

**Purpose:** Enable joint/cross-organization projects, formal fund↔organization funding agreements, mandatory organization reporting, and a proper civic category taxonomy — the features that specifically make municipalities (not just NGOs) first-class participants.

**Features delivered:**
- `ProjectParticipation` (owner / executing_agency / funding_partner / supervising / beneficiary_rep) — participation changes both permission checks and tenancy outcomes; visible on project detail.
- `FundingAgreement`: Board-managed, `draft → active/suspended/completed/terminated`; allocations may reference an agreement; **overdue reports block disbursements per the agreement's terms** (spec-proven, not just documented).
- `OrganizationReport`: one lifecycle covering both progress and financial report types (a deliberate design decision — see the decision log below — implemented as one table with a `type` discriminator rather than two identical tables); `submitted → under_review → accepted | returned` with mandatory comments on return; obligations **computed** from agreement schedules, not manually tracked; a daily overdue sweep generates events and organization notifications.
- `ProjectCategoryNode`: a 21-node hierarchical civic taxonomy (infrastructure/education/healthcare/social_support-with-children/emergency_relief/etc., i18n ar/fr); `Project.categoryId` and `StudyDepartmentTemplate.categoryNodeId` backfilled with a hard 100%-coverage gate; template generation walks the tree (a child node inherits its nearest ancestor's template set); both legacy category enums (`ProjectCategory`, `ProjectType`) frozen (nullable, Prisma-middleware-enforced unwritten) but still **accepted** at the API edge for old clients and resolved to taxonomy nodes.
- `org-verification` workflow **activated**, gated on a `documents_present` guard (org documents anchor on the organization's own content block); self-registration flag-gated (`ORG_SELF_REGISTRATION`: off/allowlist/open); Board verification queue + UI; activation grants type-default capabilities (e.g. municipality → government entity + Board oversight, no public donations by default).
- `project-lifecycle` **v2 activated** — selected at project start by the owner organization's `requiresBoardOversight` flag; running v1 instances stay pinned to v1; `decideStudy` routes through the new `board_review` hop; capability-gated donations chain. v2 also gained `approved → executing` (agreement/allocation-funded municipal projects can skip the public-donations station entirely — a deliberate data change, documented in the decision log below).
- `emergency-relief` **activated** — Board-only initiation via policy, decision guard on the project subject directly (no study required), a narrow engine-native execute route.
- Joint-project mechanics: project-scope grants (`project_lead`, `contributor`, etc. — must be a member of a participating organization), tenancy made participation-aware (own + participating + granted organizations — a permanent leak test proves exactly-this-project confinement), a cross-org-aware assignee picker, cross-org task completion covered by e2e.
- Organization reporting workspace (composer, obligation calendar, resubmit) + Board tabs (verifications, reports with overdue flags).
- Pilot chain exercised end-to-end, live on the deployed stack: registration → document + decision guards → activation with municipal capabilities → v2 project → infrastructure study sections → signed agreement → report in the Board queue.
- W6 addendum: `Project.primaryFundId` ("fund of record") + backfill + `PROJECT_FUND_REQUIRED` flag (currently OFF — fund selection stays optional while the backfill is verified).
- 348 e2e across 33 suites + 82 unit tests; lint/typecheck/builds all clean.

**Architecture changes:** This wave proved the "no special-case entities" principle end to end — a municipality is `Organization(type=municipality)` running through the *same* project/study/funding/reporting machinery as an NGO, differentiated entirely by capability flags and which workflow definition is selected, never by a hardcoded `if (type === 'municipality')` branch anywhere in the codebase.

**Database changes:** `project_participations`, `funding_agreements`, `organization_reports`, `project_category_nodes` tables added; `projects.primary_fund_id` column added.

**Breaking changes:** None to existing API contracts. The `approved → executing` v2 addition (see decision log) is a data/behavior change but only for *new* v2-definition project instances, not existing ones.

**Migration notes / decision log (recorded verbatim from `workspaceroadmap/PROGRESS.md` because each is a real deviation worth preserving):**
- `ProgressReport`/`FinancialReport` were implemented as **one** table (`OrganizationReport`) with a `type` discriminator, not two — the original design docs described identical shapes/lifecycles for both, so two tables would have been pure duplication.
- v2's `approved → executing (begin_execution)` transition was added because agreement/allocation-funded municipal projects legitimately never open public donations, so execution needed to be reachable without the `donations_open` station — this is exactly the extensibility the workflow engine was built for.
- Category freeze mechanics: both legacy enum columns made nullable and frozen via Prisma middleware; legacy values are still accepted at the API edge and resolved to taxonomy nodes so old clients keep working.
- Organization documents anchor on the organization's content block (`File.referenceId` carries a hard FK to `blocks`), which is how the `documents_present` guard resolves org → contentBlockId.
- A Wave 4 parity job false positive was fixed: engine-born projects legitimately sit at `draft` with no study; `board_review` is correctly accepted for `voting_closed` under v2; non-`project-lifecycle` definitions are correctly skipped by the parity check (engine-native, no legacy columns to compare against).

**Pending ops (recorded, not yet done as of this writing):** a real municipality onboarded through the pilot program with Board sign-off before flipping `ORG_SELF_REGISTRATION=open`; production backfill (categories) rehearsal.

---

## Wave 7 — Reporting & Transparency
**Status:** 🟡 · Started 2026-07-10 · **Read-only wave — introduces no new domain truth**

**Purpose:** Give the public (and the Board) one trustworthy read layer over everything the previous six waves built — without duplicating or risking divergence from the underlying ledger/workflow/governance data.

**Features delivered:**
- `TransparencyReadService`: cached aggregates over ledger/workflow/governance/category data, per-aggregate "as of" freshness, 60-second TTL **plus** event-driven invalidation (`ledger.posted`, `workflow.transitioned`, decision/report/project/fund-change events) — the same read layer serves both public and internal numbers, proven never to diverge.
- Publication policy as **Board-controlled data**, not code: `PublicationPolicy` table, 9 conservative defaults seeded; changes are chair-gated and audited (`publication_policy.changed`); `never_public` classes are immutable — beneficiary data cannot be opened by policy, ever.
- Privacy hard-excluded at the query level: the read layer never selects donor/participant identity columns or study section content; the legacy public study endpoint now redacts section content for social-support-tree projects (`beneficiaryDataWithheld` flag).
- Public surface: `@Public()` + `ThrottlerGuard` (burst 20/s, sustained 200/min per IP) + `Cache-Control` headers — applied to the transparency/export controllers specifically, not globally (see `SYSTEM_ARCHITECTURE.md` §10 for what this means elsewhere).
- Exports from ledger queries: public fund statement CSV (policy-gated), workspace project statement + organization annual summary CSVs — RFC-4180, with a round-trip utility, reconciling with treasury balances by construction (not by separate reconciliation logic).
- `/dashboards/board` (KPIs, funds comparison, decision throughput including median queue age, overdue reports) and `/dashboards/org` (portfolio, funding received, report calendar); fund monthly trends; the legacy `dashboard/stats` platform headline now **delegates** to this read layer (a parity spec proves the numbers can't diverge).
- Public portal on `apps/web`: `/transparency` hub (platform stats, funds overview, organization directory), fund pages (intake/allocations/spend-by-category + CSV download), organization pages (profile, verified badge, portfolio), and project pages gaining the **money trail** (intake → account credit → spend category, funding sources including named funds, full Board decision history, "as of" freshness) — available in en/ar/fr, with no URL breakage for existing project pages.
- Load-tested on the live stack: 600 public requests at ~20 req/s → p50 4.2ms / p95 9ms; the per-IP limiter absorbed a 400-request single-source flood with operational (internal) p95 latency unaffected.
- 365 e2e across 35 suites + 82 unit tests; a new permanent `w7-transparency` spec (13 tests: aggregate parity, event-driven refresh, policy flow including immutability, donor/beneficiary privacy probes, rate limiting, CSV reconcile/round-trip, dashboard parity).

**Architecture changes:** Established the "one source for public and internal numbers" pattern — no separate reporting pipeline exists that could drift from what the public sees.

**Database changes:** `publication_policies` table added. No changes to any financial/governance table — by design, this wave reads, it does not write new domain truth.

**Breaking changes:** None.

**Migration notes / decision log:**
- "Materialized views / cached aggregates" were implemented as in-process cached aggregates (60-second TTL + event-driven invalidation) rather than actual Postgres materialized views — same freshness guarantee, no extra migration surface. Revisit as materialized views or a read replica in Wave 8 only if real load demands it.
- Statement exports ship as CSV only; PDF export was deliberately deferred — the print-ready public portal pages cover the human-readable need without adding a server-side PDF dependency for this layer (the older `reports` module's PDF exports, from before this wave, are unrelated and remain available).
- `ThrottlerGuard` was applied to the public transparency surface **only**, not globally, specifically to avoid changing any other endpoint's operational behavior mid-wave — global rate limiting (including finally closing BUG-2 on `/auth/*`) is explicitly left as a Wave 8 hardening item.

**Pending ops:** Board publication-policy review and sign-off before publicly announcing the portal; a read replica is deferred until real load actually demands it.

---

## Pilot Release Readiness — Consolidation Pass (2026-07-10)

Not a numbered wave — a **verification and blocker-fix pass** run against the Wave 0–7 state before considering a pilot. Distinct from the formal "Wave 8 — Final Consolidation" described in `ROADMAP.md`, which has **not** started.

**Verified (raw results, same commit):** 365/365 e2e across 35 suites, 82/82 unit tests, 0 custom-lint-rule errors, clean `tsc --noEmit`, clean builds (api/admin/web), all 23 migrations apply cleanly to a fresh database, seed gates all pass exactly, a clean Docker `down -v` → fresh-volume start brings up all 5 containers healthy with all 4 seeded logins returning 200, and a live load check showed p50 4.2ms/p95 9ms on public endpoints with the per-IP limiter absorbing a flood.

**Blockers fixed in this pass:**
- **BUG-9** — dashboard endpoints were unrestricted, letting any participant list platform-wide recent donations including donor names and amounts. Fixed: staff-only `@Roles` at the controller level.
- **BUG-8** — `GET /study/:id` was unrestricted, exposing drafts, rejection reasons, and unpublished sections to any authenticated participant, bypassing the Wave 7 beneficiary redaction. Fixed: staff-only; public reads stay on the redacted by-project route.
- **BUG-11** — any participant could read any other participant's profile and donation history. Fixed: self-scope only; foreign ids now read as 404.
- **BUG-1** — `study_approved` notifications crashed on an invalid Prisma query, so voters/donors were never notified. Fixed: corrected the nested `select`.
- Also reconfirmed live in this pass: BUG-6 (refresh flow) and BUG-10 (same-second login collision) — both previously fixed, both still holding.

**Remaining blockers — must be resolved before any pilot exposure** (see `BACKUP_RECOVERY.md` §9 and `SYSTEM_ARCHITECTURE.md` §10 for full detail): secrets still ship as `.env.example` placeholders; **BUG-2 (no auth rate limiting) is still open**; SMTP is not configured in this environment; TLS + real domains are not yet configured (everything points at `localhost`).

---

## Related documents
- `ROADMAP.md` — what's completed, in progress, and planned, including the not-yet-started Wave 8.
- `SYSTEM_ARCHITECTURE.md` — the resulting architecture these waves built, described as it stands today rather than chronologically.
