# 19 — Wave 8: Final Consolidation

## Goals
Pay off the transition debt: remove every dual-write, feature flag, and legacy representation kept for compatibility; drop dead columns/tables; harden the database layer (RLS, grants); leave the codebase as if the platform had always been built this way. **This is the only wave allowed to contract (`09`).**

## Preconditions (hard gate)
- All Wave 0–7 DoDs met; all nightly parity/consistency jobs green for an agreed quiet period (recommend 30 days).
- Reader census per legacy item: proof (grep + query logs) that nothing reads it. Any item failing the census stays for a later consolidation pass — this wave never forces a removal.

## The contract list

### Dual-writes & flags removed
- Workflow → legacy enum sync (W4); treasury → `ProjectTransaction` sync (already stopped in W5 — verify); decision → `approvedById` sync (W3); FK-twin double-writes (W2); role-grant → `AdminRole` sync (W1).
- All migration feature flags deleted (each has an owner and this removal wave recorded at creation, per `09`); `RolesGuard` and other dormant legacy enforcement code deleted.

### Schema drops (after reader census, snapshot before each batch)
- **D1 close:** legacy Block-FK columns on the 7 execution/financial tables; relations re-pointed to `projects.id` twins as the only FK.
- **D2 close:** legacy Admin-FK assignee/creator columns; `Admin` model reduced to profile data or folded into `User` + memberships (decide by then-current usage; either is compatible with the target model).
- **D3 close:** lifecycle status enum columns (`studyStatus`, voting window fields on `ProjectStudy`) — engine instance is sole truth; drop or convert to generated views if external consumers linger.
- **D5 close:** `AdminRole` enum dropped.
- Frozen tables dropped: `StudyVote`, `ProjectTransaction` (contents preserved in a cold archive schema/dump first — they are historical financial/vote records; archive, never destroy).
- Legacy category enums (`ProjectCategory`, `ProjectType`) dropped; `ProjectCategoryNode` sole taxonomy.

### Hardening
- **Postgres RLS** as tenancy backstop on org-owned tables (layer 3 from `05`), verified not to break Board bypass or public read layer.
- **DB grants:** app role loses UPDATE/DELETE on immutable tables (`AuditLog`, `LedgerTransaction`, `LedgerEntry`, `Vote`, `BoardDecision`, `WorkflowStepLog`) — immutability enforced by the database, not convention.
- Migration history squash in `packages/database` (linear history preserved in git); seed script rewritten to the final model (orgs, grants, funds, definitions — no legacy writes).
- Optional per load: read replica for the transparency layer.

## Migration strategy
- Batched contraction: one legacy item (or coherent group) per deploy — census → snapshot → drop → full regression + parity re-run → next. No big-bang drop day.
- Each drop's PR links its census evidence; rollback = snapshot restore (drops are the one irreversible class, hence per-batch snapshots).
- Update all docs in this folder to remove "legacy/dual-write" language; `01_CURRENT_SYSTEM_ANALYSIS.md` archived as historical.

## Risks
| Risk | Mitigation |
|---|---|
| Hidden reader of a dropped column (external script, BI tool) | Query-log census over the quiet period, not just code grep; batched drops localize the blast radius |
| RLS breaks Board bypass or public views | RLS ships in permissive/log mode first, enforce after zero violations over a soak window |
| Archive of financial history done carelessly | Archive verified restorable before drop; checksum + restore rehearsal |
| Fatigue: consolidation skipped as "optional" | It isn't: D1–D5 close here; un-contracted systems rot into permanent dual-truth. Gate any post-program feature work on W8 completion |

## Dependencies
All waves 0–7 complete and soaked.

## Definition of done
- [ ] Zero dual-writes, zero migration flags, zero dormant legacy guards in the codebase (grep-verified checklist per contract list).
- [ ] D1–D5 all closed; schema contains no Block-rooted domain FKs, no Admin-rooted assignees, no lifecycle enums, no global role enum.
- [ ] `StudyVote` / `ProjectTransaction` archived (restore-tested) and dropped.
- [ ] RLS enforcing on org-owned tables; DB-level immutability grants active; both verified by dedicated tests.
- [ ] Full regression + parity suites green; fresh `pnpm db:seed` environment works end-to-end on the final model.
- [ ] Docs folder updated to describe the system as it now is; program formally closed.
