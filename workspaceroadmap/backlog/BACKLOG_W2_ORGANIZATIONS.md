# Backlog — Wave 2: Organizations & Workspaces
Source: [`../13_WAVE_2_ORGANIZATIONS.md`](../13_WAVE_2_ORGANIZATIONS.md)

---

## Epic W2-E1 — D1 repair: Block-FK → Project-FK

**S1 · M · db,migration — `projectRefId` columns + backfill**
Do: Additive `projectRefId → projects.id` on `project_steps, project_phases, project_tasks, project_budgets, project_expenses, project_transactions, project_milestones`; backfill via `Block↔Project` 1:1; verification `count(legacy)=count(new)` per table and per project.
AC: 100% backfill on all 7 tables; verification queries archived.
Deps: W1 done

**S2 · M · api — Dual-write both FK generations**
Do: `execution`, `financial`, `milestones` services write legacy Block-FK + new Project-FK on create/update.
AC: Consistency spec: created rows carry matching pairs; regression green.
Deps: S1

**S3 · S · infra — Nightly FK-pair consistency job**
Do: Job comparing FK pairs across the 7 tables; alert on mismatch; runs until Wave 8.
AC: Green nightly; alert tested.
Deps: S2

**S4 · M · api — Reader cutover to `projectRefId`**
Do: Module-by-module (execution → financial → milestones → reports/dashboard queries) switch reads to new FK; grep-verified per module.
AC: Each module's cutover behind review checklist; regression green after each.
Deps: S2

## Epic W2-E2 — D2 repair: Admin-FK → User-FK

**S1 · M · db,migration — `*UserId` twin columns + backfill**
Do: `assignedToUserId`/`createdByUserId`/`approvedByUserId` twins beside Admin-FKs on `study_sections`, `project_tasks`, `project_studies`, donation `approved_by`; backfill via `Admin→User` link; verification per column.
AC: 100% backfill; verification archived.
Deps: W1 done

**S2 · M · api — Dual-write + reader cutover**
Do: `study`, `execution`, `donations` services write both generations; assignee reads move to User-FK; assignee pickers list org members (users) via `organizations` module.
AC: Assigning a non-Admin org member user works end-to-end on a task; regression green.
Deps: S1, E4-S1

## Epic W2-E3 — Tenancy enforcement

**S1 · M · api — Enforcement flip (flag `TENANCY_ENFORCED`)**
Do: Org-owned aggregates (projects + subtree) routed through the Wave 1 base repository; Board platform-read bypass implemented as policy grant + audited.
AC: Flag OFF = Wave 1 behavior; ON = scoped; regression green both modes.
Deps: W1-E5-S2

**S2 · M · qa — Two-org leak test (permanent)**
Do: Spec: two orgs with full data trees; walk every list/detail/report/dashboard endpoint asserting zero cross-visibility; plus Board account asserting visibility WITH audit entries.
AC: In permanent suite; green with flag ON.
Deps: S1

**S3 · S · infra — Unscoped-access lint**
Do: CI rule forbidding direct Prisma access to org-owned tables outside the base repository (allowlist for audit/system paths).
AC: Violation fails CI on changed files.
Deps: S1

## Epic W2-E4 — PolicyGuard enforcement

**S1 · M · api — Flip enforcement (flag `POLICY_ENFORCED`)**
Do: `PolicyGuard` becomes blocking; `RolesGuard` dormant-but-present (rollback per `../09`); shadow logging retired.
AC: Zero-divergence evidence from W1 linked; regression + leak test green with flag ON; flag-flip rollback rehearsed in staging.
Deps: W1-E4-S3, E3-S1

## Epic W2-E5 — Workspace shell (apps/admin)

**S1 · L · admin-ui — Context picker + scoped shell**
Do: Post-login context picker (org memberships + Board workspace if platform grants); active context in header (switch = new JWT via refresh); sidebar/nav scoped; single-membership users auto-contexted (zero-change UX for current staff).
AC: Seeded admin sees identical daily UX; a two-org user switches contexts and sees correctly scoped data.
Deps: E3-S1

**S2 · M · admin-ui — Member & role management screens**
Do: Org workspace screens: member list, invite/add, role grant/revoke writing `RoleAssignment` (org scope), capability view (read-only for org_admin).
AC: Granting `project_manager` immediately affects `can()` outcomes (spec); all changes audited.
Deps: S1

**S3 · S · admin-ui — Board workspace placeholder**
Do: Board context: cross-org project list (read-only), queue placeholder for Wave 3.
AC: Board member sees all orgs' projects; org users don't see the workspace.
Deps: S1

## Epic W2-E6 — Org onboarding (manual) & pilot

**S1 · M · api,admin-ui — Manual org creation + first-admin invite**
Do: Platform/Board flow: create org (type-flag gated, allowlist per `../09`), invite first `org_admin` (email invite → account → membership + grant).
AC: New org reachable end-to-end by its admin; invisible to other orgs.
Deps: E5-S2

**S2 · L · qa — Pilot org full-lifecycle run**
Do: Onboard a pilot NGO/youth team; run one project through study→voting→approval→donation (both channels)→execution→closure entirely inside its workspace.
AC: Wave-doc DoD pilot bullet satisfied; findings filed as stories before wave close.
Deps: all epics

**S3 · S · docs — Wave close**
Do: DoD walk; `PROGRESS.md` (W2 ✅, D1/D2 → "repaired, dual-write"); flag inventory updated.
AC: DoD checked with evidence.
Deps: S2
