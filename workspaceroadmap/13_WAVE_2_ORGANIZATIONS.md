# 13 — Wave 2: Organizations Live (NGOs, Teams — Workspaces & FK Repairs)

## Goals
Multi-organization becomes real and visible: workspace-scoped admin app, NGO/youth-team onboarding, org-owned projects with tenancy enforcement — and the two FK debts (D1 Block-rooted, D2 Admin-rooted) repaired additively so later waves join against real domain keys.

## New tables / modules
- No new tables — this wave is columns + UX + enforcement:
  - **D1:** `projectRefId → projects.id` added to `project_steps`, `project_phases`, `project_tasks`, `project_budgets`, `project_expenses`, `project_transactions`, `project_milestones`; backfilled via the `Block ↔ Project` 1:1 link.
  - **D2:** `assignedToUserId`/`createdByUserId` twins (→ `users.id`) beside every `Admin`-FK assignee/creator column (`study_sections.assigned_to`, `project_tasks.assigned_to_id`, `project_studies.created_by_id`, `approved_by` columns); backfilled via `Admin → User`.
- **Workspace shell** in `apps/admin`: context picker (org memberships + Board workspace when applicable), org-scoped navigation, member & role management screens (writing `RoleAssignment`).
- **Org onboarding (manual mode):** platform/Board creates orgs and invites the first `org_admin` (self-service verification workflow arrives with the engine — Wave 6). `youth_team` flag may be enabled for pilot orgs.

## What changes in the existing system
- **Tenancy enforcement flips ON:** the base repository from Wave 1 now filters org-owned aggregates (projects and everything under them) by `activeOrgId`; Board platform-read bypass active and audited. CI lint forbids unscoped access to org-owned tables.
- **PolicyGuard enforcement flips ON** (shadow burn-down completed in Wave 1); `RolesGuard` dormant but retained (`09` rollback rule).
- Execution/financial/study services write **both** FK generations (legacy Block/Admin columns + new twins) on create/update; reads move to new FKs module-by-module.
- `projects` module: creation now requires org context; assignee pickers list org members (users), not `Admin` rows.
- `apps/web`: project pages may display the owning organization (additive; slugs/URLs unchanged).

## Migration strategy
- Both FK repairs follow the "replacing a representation" sequence (`09`): expand (columns) → backfill (via existing 1:1 links — deterministic, verifiable by count equality) → dual-write → per-module reader cutover → contract in Wave 8.
- Tenancy flip is a flag: OFF = Wave 1 behavior. Soak with flag ON in staging against full regression before production.
- New-org creation gated per org (allowlist) for the first pilot NGO/team before general use.

## Risks
| Risk | Mitigation |
|---|---|
| A missed unscoped query leaks cross-org data | Three-layer defense (`05`); dedicated leak-test: create 2 orgs, assert zero cross-visibility on every list/detail/report endpoint (becomes permanent regression member) |
| Backfill mismatch on Block↔Project derived FKs | 1:1 link makes derivation exact; verification asserts `count(legacy) = count(new)` per table and per project |
| Dual-generation FK writes forgotten in an edge path | DB triggers (temporary) or nightly consistency job comparing FK pairs until Wave 8 |
| Workspace UX churn for existing staff | Single-membership users skip the picker (auto-context); zero-change experience for the current team |

## Dependencies
Wave 1 (orgs, grants, policy shadow complete). Overlappable with Waves 3/4 per `10`.

## Definition of done
- [ ] Two-org leak test green and in the permanent suite; tenancy + PolicyGuard flags ON in production.
- [ ] 100% FK-twin backfill verified on all 7 D1 tables and all D2 columns; nightly consistency job green.
- [ ] Execution/study/financial module reads use new FKs (grep-verified); legacy columns write-synced only.
- [ ] A pilot NGO (or youth team) onboarded: own workspace, own project through study→voting→approval→donation→execution, invisible to the default org.
- [ ] Board workspace shows cross-org project list (read-only queue placeholder for Wave 3).
- [ ] Regression suite green flags-OFF and flags-ON (`09` contract).
