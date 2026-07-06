# Backlog — Wave 8: Final Consolidation
Source: [`../19_WAVE_8_FINAL_CONSOLIDATION.md`](../19_WAVE_8_FINAL_CONSOLIDATION.md) · Hard gate: all parity/consistency jobs green 30 days; per-item reader census before any drop; snapshot before every batch.

---

## Epic W8-E1 — Gate & census

**S1 · M · infra,docs — Quiet-period verification + reader census**
Do: Evidence pack: 30-day green streak for every nightly parity job (enum↔grant W1, FK pairs W2, decision↔legacy W3, enum↔state W4, reconciliation W5); per-legacy-item census (code grep + DB query logs) proving zero readers of: legacy Block-FKs, Admin-FKs, `AdminRole`, `studyStatus`+voting-window columns, `StudyVote`, `ProjectTransaction`, category enums, dormant `RolesGuard`.
AC: Census document per item with evidence links; items failing census explicitly deferred (never forced).
Deps: W0–W7 all ✅

## Epic W8-E2 — Remove dual-writes, flags, dormant code

**S1 · M · api — Stop all dual-writes**
Do: Remove: workflow→enum sync, decision→`approvedById` sync, FK-twin double-writes, grant→`AdminRole` sync; retire corresponding nightly jobs (final green run archived).
AC: Grep-verified none remain; regression green.
Deps: E1

**S2 · M · api,infra — Delete migration flags + dormant enforcement**
Do: Remove all wave feature flags (per flag inventory from `../09`); delete `RolesGuard` and legacy authorization code paths; remove temporary lint rules that guarded dual-write columns.
AC: Flag inventory empty; dead-code sweep reviewed.
Deps: S1

## Epic W8-E3 — Schema contraction (one batch per deploy: census → snapshot → drop → full regression)

**S1 · M · db,migration — D1/D2 close**
Do: Drop legacy Block-FK columns on the 7 execution/financial tables (relations re-pointed to `projectRefId` as sole FK, renamed if desired); drop Admin-FK assignee/creator columns; decide + execute `Admin` model endgame (profile-only or fold into `User`) per then-current usage.
AC: Schema review: zero Block-rooted domain FKs, zero Admin-rooted assignees; regression green.
Deps: E2

**S2 · M · db,migration — D3/D5 close**
Do: Drop `studyStatus` + voting-window columns (or convert to generated views if census found lingering external consumers); drop `AdminRole` enum.
AC: Engine instance is sole lifecycle truth; regression green.
Deps: E2

**S3 · M · migration — Archive & drop frozen tables**
Do: `StudyVote` and `ProjectTransaction` → cold archive (dump + checksum + **restore rehearsal**), then drop; drop legacy category enums.
AC: Restore rehearsal documented; tables gone; archives stored per retention policy.
Deps: E2

## Epic W8-E4 — Database hardening

**S1 · M · db,infra — Postgres RLS (permissive → enforce)**
Do: RLS policies on org-owned tables as tenancy backstop (layer 3 per `../05`); ship in permissive/log mode; enforce after zero violations over soak; verify Board bypass and public read layer unaffected.
AC: Leak test + Board access + portal all green with RLS enforcing; violation log empty over soak.
Deps: E3

**S2 · S · db — Immutability grants**
Do: App DB role loses UPDATE/DELETE on `AuditLog`, `LedgerTransaction`, `LedgerEntry`, `Vote`, `BoardDecision`, `WorkflowStepLog`; dedicated tests attempt violations.
AC: Violation attempts fail at DB level (tests in suite).
Deps: E3

## Epic W8-E5 — Finalization

**S1 · M · db,migration — Migration squash + final seed**
Do: Squash `packages/database` migration history (linear history preserved in git); rewrite seed to the final model (orgs, grants, funds, definitions, categories — zero legacy writes); fresh-environment bootstrap test.
AC: `migrate deploy + db:seed` from empty DB yields a working platform e2e (spec).
Deps: E3, E4

**S2 · S · docs — Docs update & program close**
Do: Update this folder: remove legacy/dual-write language from pillar docs; archive `01_CURRENT_SYSTEM_ANALYSIS.md` as historical; `PROGRESS.md` all ✅ incl. debt scoreboard D1–D5 closed; decision log completed.
AC: Docs describe the system as it now is; program formally closed.
Deps: S1
