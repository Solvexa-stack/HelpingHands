# 02 — Target Architecture

## Purpose
Define the end-state architecture all waves converge on: module boundaries, ownership rules, and interaction contracts. Waves may ship partial functionality, but nothing that contradicts this shape.

## Problems this document solves
- Prevents each wave from inventing its own integration style.
- Fixes the two ownership rules (money → Treasury, state → Workflow Engine) that make transparency enforceable.
- Settles the monolith-vs-microservices question so it is not reopened mid-project.

## Architectural decision: modular monolith
The NestJS API remains **one deployable**. Rationale: donation approval → ledger posting → progress recalculation → audit entry must be one database transaction; the platform is regional-scale; the team is small. Module boundaries are enforced as if they were services (no cross-module table access), so later extraction remains possible. Revisit only if sustained load or team size demands it — not before Wave 8.

## Module map (bounded contexts)

```
┌───────────────────────────────────────────────────────────────────┐
│                          apps/api (NestJS)                        │
│                                                                   │
│  Identity & Access      Organizations         Governance          │
│  authn, RoleAssignment, org registry,         Board decisions,    │
│  policy engine (§08)    memberships,          vote rounds (§07)   │
│                         capabilities (§05)                        │
│                                                                   │
│  ───────────── Workflow Engine (definitions, instances) ───────── │
│                              (§04)                                │
│                                                                   │
│  Projects               Funds & Treasury      Reporting &         │
│  lifecycle, studies,    ledger, funds,        Transparency        │
│  execution, tasks       allocations,          dashboards, portal, │
│  (existing modules)     donations intake (§06) exports (Wave 7)   │
│                                                                   │
│  Cross-cutting: Audit (append-only) · Notifications · Content/   │
│  i18n (Blocks) · Files                                            │
└───────────────────────────────────────────────────────────────────┘
```

## Ownership rules (non-negotiable)

1. **Treasury owns money.** No module writes `LedgerTransaction`/`LedgerEntry` except Treasury. Projects request disbursements; donation modules hand completed intake to Treasury for posting. Balances are derived from entries, never stored-and-edited.
2. **Workflow Engine owns lifecycle state.** After Wave 4, no service flips a status column directly; they call `execute(instance, action, actor)`. Until Wave 4, existing enum logic stays as-is (frozen).
3. **Policy engine owns authorization answers.** Controllers, workflow guards, and query scoping all ask the same `can(actor, action, resource)` service (`08`). No module re-implements permission checks.
4. **Audit is a subscriber, not a call.** Modules emit domain events (`donation.approved`, `board.decision.recorded`, `allocation.disbursed`); the audit module records them. Forgetting to call audit must be impossible, not discouraged.
5. **Content (Blocks) is presentation.** Domain tables FK to domain tables; a project *has* a content block for its public page. (Target state of D1.)

## Interaction contract
- **In-process domain event bus** (Wave 0) with typed events; synchronous subscribers for audit, asynchronous-capable for notifications/recalculation.
- Module-to-module calls go through each module's exported service interface; importing another module's Prisma models directly is a lint-enforced violation.
- All mutating service methods take an `ActorContext { userId, activeOrgId, roleAssignments, requestId }` as their first argument (introduced Wave 0).

## Frontend target
- `apps/admin` → **workspace application**: after login the user selects a context (organization or fund); navigation, data, and actions are scoped to it. Board members additionally get the cross-organization governance workspace. One app, context-switched.
- `apps/web` → **public transparency portal** + donor/participant experience: org public pages, fund dashboards, project progress, donation flows (Wave 7).

## System impact
- Existing modules (`projects`, `study`, `voting`, `donations`, `payments`, `execution`, `financial`) are **kept and refactored in place**; new modules (`organizations`, `governance`, `workflow`, `treasury`, `audit`, `policy`) are added beside them.
- `RolesGuard` is superseded by `PolicyGuard` (Wave 1, shadow mode first).

## Connections
- Data shapes for every module: `03_DATA_MODEL.md`.
- Per-pillar detail: `04`–`08`.
- The order modules come alive: `10_IMPLEMENTATION_WAVES_PLAN.md`.
