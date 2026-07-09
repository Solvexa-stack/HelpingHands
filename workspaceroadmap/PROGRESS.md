# Roadmap Execution Progress

The executable work items for each wave live in [backlog/](backlog/) (`BACKLOG_W0` … `BACKLOG_W8`, conventions in [backlog/BACKLOG_00_OVERVIEW.md](backlog/BACKLOG_00_OVERVIEW.md)).

Track realization of each wave here. A wave's status moves to ✅ only when every item in its document's **Definition of Done** is checked. Update this file in the same PR that completes the work.

**Statuses:** ⬜ not started · 🔵 in progress · 🟡 in soak/verification · ✅ done

| Wave | Document | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 0 — Foundations | [11_WAVE_0_FOUNDATIONS.md](11_WAVE_0_FOUNDATIONS.md) | 🟡 | 2026-07-07 | | E1–E4 complete: 215 e2e + 51 unit green; 36 event types; audit trail + admin viewer; soft delete flag-gated dark. **Pending ops (W0-E5)**: ① mark `e2e-regression-suite` required in branch protection ② deploy staging with `SOFT_DELETE_ENFORCED=true`, 1-week soak ③ production flip + DoD sign-off. Code-side DoD gap: 35 legacy methods still grandfathered for ActorContext (lint ratchet active). 11 bugs in [backlog/BACKLOG_BUGS.md](backlog/BACKLOG_BUGS.md) |
| 1 — Identity & Multi-Tenancy | [12_WAVE_1_IDENTITY_MULTI_TENANCY.md](12_WAVE_1_IDENTITY_MULTI_TENANCY.md) | 🟡 | 2026-07-08 | | All epics implemented: tenancy schema (orgs/memberships/grants/owner FK NOT NULL), organizations module (admin-only, audited, type-flagged), idempotent backfills (default org + Board + memberships + grants, audited), nightly parity job, policy engine in shadow (zero divergence over regression sweep), `activeOrgId` claim + token v2 (BUG-6 refresh fixed), dark TenancyRepository, admins dual-write. 234 e2e + 81 unit green, flags OFF suite green. **Pending ops**: shadow-mode 2 production weeks (W1-E4-S3) + Wave 0 soak chain. D5 → begun |
| 2 — Organizations | [13_WAVE_2_ORGANIZATIONS.md](13_WAVE_2_ORGANIZATIONS.md) | 🟡 | 2026-07-08 | | All epics implemented: D1 repaired (projectRefId backfilled+verified, dual-write, readers cut over, nightly pair job) · D2 repaired (User-FK twins, dual-write, assignee cutover, non-admin assignees) · tenancy enforced behind TENANCY_ENFORCED (two-org leak test permanent, Board bypass audited, unscoped-read lint) · POLICY_ENFORCED flip with one-flag rollback · workspace shell (context picker/switcher, org+role management screens, Board placeholder) · manual onboarding + invite flow · pilot full-lifecycle spec green flags-ON. 256 e2e + 81 unit green (flags OFF and ON). **W2 isolation complete (2026-07-08)**: tenant filtering extended to donations, online donations, studies/sections/votes, dashboard, reports, participants; project update/delete asserted; creation ownership from `ActorContext.activeOrgId` (finding closed); `TENANCY_ENFORCED`+`POLICY_ENFORCED` default ON (`.env`/`.env.example`, rollback = flip to false); org workspaces hide platform-admin nav + show workspace identity; A/B isolation spec `w2-tenancy-isolation` added (7 tests). Refresh-token same-second collision fixed (jti). 268 e2e + 81 unit green. **Findings still open**: study governance transitions gated on enum role (D5, Wave 3/8); content blocks/languages remain platform-shared (org admins with employee role see content nav) — Wave 6 CMS scope. **Pending ops**: staging/production deploy with the new defaults |
| 3 — Governance Board | [14_WAVE_3_GOVERNANCE_BOARD.md](14_WAVE_3_GOVERNANCE_BOARD.md) | 🟡 | 2026-07-08 | | All epics implemented (2026-07-08): governance schema (`BoardDecision`/`VoteRound`/`Vote`, immutable) · governance module (decision recording w/ mandatory rationale, round lifecycle w/ eligibility+quorum/threshold, cross-org review queue, board-role policy gating) · StudyVote→rounds backfill (tally-verified in seed) + voting module cutover, StudyVote frozen (create/update blocked by Prisma middleware) · study approve/reject routes through governance w/ legacy sync (new→old) + nightly decision-parity job · `changes_requested` revision path w/ rationale visible to owning org · round-scoped reminders · Board workspace UI (queue/decide/history) · governance transitions gated on `study.govern` board permissions, enum gate = flags-off rollback only (D5 closed). Permanent spec `w3-governance-cycle` (9 tests). 277 e2e + 81 unit green. Tenancy isolation intact (Board bypass audited). **Workspace UI isolation (2026-07-08)**: admin app split into three workspaces — Organization Workspace at `/org/*` (own layout/nav/dashboard: Dashboard·Projects·Studies·Donations·Team·Settings; platform pages never mount for org members), Platform Workspace unchanged for platform-grant holders (incl. `/board`); guards map cross-workspace paths both ways; dev `pnpm dev` now loads the root .env (flags) via ConfigModule fallback, e2e baseline pinned flags-OFF. **Pending ops**: staging/production deploy + backfill rehearsal |
| 4 — Workflow Engine | [15_WAVE_4_WORKFLOW_ENGINE.md](15_WAVE_4_WORKFLOW_ENGINE.md) | 🟡 | 2026-07-09 | | All epics implemented (2026-07-09): engine tables + three-operation `workflow` module (row-locked atomic execute, guard registry delegating to policy, awaited effect emission) · `project-lifecycle` v1 transcribed + seeded, census/backfill with hard verification · parity harness green (`w4-parity`: identical legacy event sequence/responses with engine driving) · cutovers behind `WORKFLOW_ENFORCED` (+`WORKFLOW_SERVICES` staging): study, voting auto-close, board decisions, donations gate, funding closure; rounds created by `vote_round.create` effect · dual-write bridge + nightly `WorkflowParityService` + `no-direct-status-writes` lint · admin UI: lifecycle timeline w/ availableTransitions buttons (both workspaces) + read-only definition viewer · v2/emergency-relief/org-verification/fund-allocation authored INACTIVE. D3 → repaired (dual-write until W8). 305 e2e + 81 unit green (flags OFF and ON). **Pending ops**: staging backfill rehearsal + per-service flag rollout w/ soak |
| 5 — Treasury & Funds | [16_WAVE_5_TREASURY_FUNDS.md](16_WAVE_5_TREASURY_FUNDS.md) | 🟡 | 2026-07-09 | | All epics implemented (2026-07-09): double-entry ledger (`Account`/`LedgerTransaction`/`LedgerEntry`, immutable, treasury = sole writer w/ lint) · idempotent posting API `(referenceType,referenceId,event)` · money-event routing (QR approve, webhook complete — replay-safe, expense approve) w/ awaited emission · `ProjectTransaction` FROZEN + treasury dual-write bridge + `TREASURY_LEDGER_READS` cutover flag · accounts+ledger backfill w/ hard reconciliation gate (allocations ledger-native, excluded by definition) · funds module: Board CRUD, 5 officer roles fund-scope, structural segregation (controller read+flag only — permanent matrix spec) · `fund-allocation` workflow ACTIVATED w/ launch ceiling (BoardDecision per allocation) · fund-directed online donations · 3 initial funds seeded · /funds dashboard UI. 335 e2e + 81 unit green. **Pending ops**: production backfill + reconciliation soak, first production allocation cycle, dual-write stop after reader soak |
| 6 — Municipal Integration | [17_WAVE_6_MUNICIPAL_INTEGRATION.md](17_WAVE_6_MUNICIPAL_INTEGRATION.md) | ⬜ | | | Pilot municipality first, then GA |
| 7 — Reporting & Transparency | [18_WAVE_7_REPORTING_TRANSPARENCY.md](18_WAVE_7_REPORTING_TRANSPARENCY.md) | ⬜ | | | Read-only wave |
| 8 — Final Consolidation | [19_WAVE_8_FINAL_CONSOLIDATION.md](19_WAVE_8_FINAL_CONSOLIDATION.md) | ⬜ | | | 30-day quiet period gate before starting |

## Structural debt scoreboard

| Debt | Description | Repaired in | Closed in | Status |
|---|---|---|---|---|
| D1 | Execution/financial tables FK to Block, not Project | Wave 2 | Wave 8 | ⬜ |
| D2 | Assignees/creators FK to Admin, not User | Wave 2 | Wave 8 | ⬜ |
| D3 | Lifecycle states as hardcoded enums | Wave 4 | Wave 8 | ⬜ |
| D4 | Cascade deletes / no audit trail | Wave 0 | Wave 0 | ⬜ |
| D5 | Global 3-value role enum | Wave 1 | Wave 8 | ⬜ |

## Continuous workstreams (check every wave)

- [ ] Regression suite extended with this wave's flows and still green (flags OFF **and** ON)
- [ ] Every new mutating action emits audit events
- [ ] Seed script updated; all seeded accounts still work
- [ ] Feature flags created this wave have an owner and a removal wave recorded

## Decision log

Record deviations from the roadmap here (what changed, why, which doc was updated):

| Date | Wave | Decision | Doc updated |
|---|---|---|---|
| 2026-07-08 | 0 | Pre-existing bugs found by the regression suite are logged as `BUG-n` items instead of being fixed mid-wave; specs pin current behavior with marked assertions | [backlog/BACKLOG_BUGS.md](backlog/BACKLOG_BUGS.md) (new) |
