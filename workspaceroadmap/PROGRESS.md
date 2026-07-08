# Roadmap Execution Progress

The executable work items for each wave live in [backlog/](backlog/) (`BACKLOG_W0` … `BACKLOG_W8`, conventions in [backlog/BACKLOG_00_OVERVIEW.md](backlog/BACKLOG_00_OVERVIEW.md)).

Track realization of each wave here. A wave's status moves to ✅ only when every item in its document's **Definition of Done** is checked. Update this file in the same PR that completes the work.

**Statuses:** ⬜ not started · 🔵 in progress · 🟡 in soak/verification · ✅ done

| Wave | Document | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 0 — Foundations | [11_WAVE_0_FOUNDATIONS.md](11_WAVE_0_FOUNDATIONS.md) | 🟡 | 2026-07-07 | | E1–E4 complete: 215 e2e + 51 unit green; 36 event types; audit trail + admin viewer; soft delete flag-gated dark. **Pending ops (W0-E5)**: ① mark `e2e-regression-suite` required in branch protection ② deploy staging with `SOFT_DELETE_ENFORCED=true`, 1-week soak ③ production flip + DoD sign-off. Code-side DoD gap: 35 legacy methods still grandfathered for ActorContext (lint ratchet active). 11 bugs in [backlog/BACKLOG_BUGS.md](backlog/BACKLOG_BUGS.md) |
| 1 — Identity & Multi-Tenancy | [12_WAVE_1_IDENTITY_MULTI_TENANCY.md](12_WAVE_1_IDENTITY_MULTI_TENANCY.md) | 🟡 | 2026-07-08 | | All epics implemented: tenancy schema (orgs/memberships/grants/owner FK NOT NULL), organizations module (admin-only, audited, type-flagged), idempotent backfills (default org + Board + memberships + grants, audited), nightly parity job, policy engine in shadow (zero divergence over regression sweep), `activeOrgId` claim + token v2 (BUG-6 refresh fixed), dark TenancyRepository, admins dual-write. 234 e2e + 81 unit green, flags OFF suite green. **Pending ops**: shadow-mode 2 production weeks (W1-E4-S3) + Wave 0 soak chain. D5 → begun |
| 2 — Organizations | [13_WAVE_2_ORGANIZATIONS.md](13_WAVE_2_ORGANIZATIONS.md) | ⬜ | | | May overlap with Waves 3/4 |
| 3 — Governance Board | [14_WAVE_3_GOVERNANCE_BOARD.md](14_WAVE_3_GOVERNANCE_BOARD.md) | ⬜ | | | May overlap with Waves 2/4 |
| 4 — Workflow Engine | [15_WAVE_4_WORKFLOW_ENGINE.md](15_WAVE_4_WORKFLOW_ENGINE.md) | ⬜ | | | Do NOT parallelize with Wave 5 |
| 5 — Treasury & Funds | [16_WAVE_5_TREASURY_FUNDS.md](16_WAVE_5_TREASURY_FUNDS.md) | ⬜ | | | Requires Waves 3 + 4 complete |
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
