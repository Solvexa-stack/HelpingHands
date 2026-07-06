# 08 — Permission System (RBAC + ABAC)

## Purpose
Replace the global 3-value `AdminRole` enum (D5) with scoped role assignments plus attribute-based policies — one authorization brain answering every "may X do Y to Z" question in the platform: HTTP guards, workflow guards, query scoping, and UI affordances.

## Problems this document solves
- "Financial officer" today means financial officer *of everything*; funds, organizations, and projects need their own officer sets.
- Board authority, fund thresholds, and org capabilities are attribute questions RBAC alone cannot express.
- Authorization logic scattered across `RolesGuard` + service conditionals drifts; guards and endpoints must never disagree.

## Model

### Grants: scoped role assignments (RBAC)
```
RoleAssignment: userId, role, scopeType (platform|organization|fund|project), scopeId
```

Role catalogs per scope (extendable data, stable keys):

| Scope | Roles | Notes |
|---|---|---|
| platform | `board_chair`, `board_member`, `board_secretary`, `platform_auditor` | Governance verbs + cross-org read. No org-data writes. |
| organization | `org_admin`, `project_manager`, `staff`, `org_accountant`, `viewer` | Same catalog for every org type — capabilities differentiate orgs, roles differentiate members. |
| fund | `fund_director`, `fund_deputy`, `fund_secretary`, `fund_accountant`, `fund_controller` | Controller: read + flag only (segregation of duties). |
| project | `project_lead`, `contributor`, `financial_delegate` | For joint projects: grants on one project without org membership. |

### Decisions: policy evaluation (ABAC)
`can(actor, action, resource) → allow | deny (+reason)` combines:
1. **Role grants** along the resource's scope chain: project → owning organization → platform.
2. **Resource attributes**: workflow state, fund policy thresholds, org status.
3. **Actor's org attributes**: capabilities, participation role on the project.

Policy examples (registered as data with named condition handlers):
- `fund.allocation.approve` ⇒ `fund_director` ∧ amount ≤ `fund.policy.dualApprovalThreshold`; above threshold ⇒ additionally `fund_deputy` co-approval or `board_decision`.
- `project.report.submit` ⇒ org role ≥ `project_manager` ∧ actor's org has `ProjectParticipation(role=executing_agency)` on the project.
- `project.donation.open` ⇒ workflow state = `approved` ∧ owner org capability `canOpenDonations`.
- `treasury.entry.write` ⇒ **no human role, ever** — only the Treasury module posts entries; humans trigger domain actions that Treasury translates.

## Enforcement points (all call the same service)
1. **HTTP:** `PolicyGuard` + `@Can('project.approve')` decorators; resource scope resolved from route params. Replaces `RolesGuard` after shadow mode. `JwtAuthGuard` and `@Public()` unchanged.
2. **Workflow guards:** `{type:"role"|"capability"}` guard handlers delegate here — endpoint checks and transition checks cannot diverge.
3. **Query scoping:** tenancy repository (see `05`) derives its filter from the actor's grants; Board read-bypass is a policy grant, audited.
4. **UI:** admin app renders actions from `availableTransitions` + a `can`-batch endpoint — no client-side permission logic to drift.

Sensitive-domain decisions (financial, governance) are audit-logged **including denials**.

## Rollout: shadow mode (Wave 1)
1. Backfill grants from current data: `administrator` → `board_chair` + platform grants; `employee` → default-org `staff`; `financial_officer` → default-org `org_accountant` (+ later fund roles); participants → no grants.
2. `PolicyGuard` runs beside `RolesGuard`, logging agree/disagree without enforcing.
3. Divergences fixed until agreement is 100% over a full regression pass + N production days.
4. Flip enforcement to `PolicyGuard`; keep `RolesGuard` code until Wave 8 for rollback.

## What changes in the existing system
- New `policy` module; `@Roles(...)` usages replaced by `@Can(...)` incrementally (both work during transition).
- `AdminRole` becomes derived-only after backfill (writes to it forbidden by lint), dropped Wave 8.

## Connections
- Grant entities: `03_DATA_MODEL.md` §1. Tenancy filtering: `05`. Fund thresholds: `06`. Board roles: `07`.
- Execution: `12_WAVE_1_IDENTITY_MULTI_TENANCY.md` (engine + shadow), hardening through all waves.
