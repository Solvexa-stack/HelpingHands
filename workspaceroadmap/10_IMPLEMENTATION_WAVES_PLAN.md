# 10 — Implementation Waves Plan (Master)

## Purpose
The master sequencing document: what ships in each wave, why in that order, and the dependency graph. Each wave has its own executable doc (`11`–`19`); this is the map.

## Sequencing logic
1. **Safety before features** (Wave 0): audit, soft delete, events, regression suite — everything after becomes low-risk.
2. **Identity before everything tenant-shaped** (Wave 1): orgs + scoped grants are the substrate for Board, funds, and municipalities.
3. **Governance before money** (Wave 3 before 5): allocations require Board decisions to exist.
4. **Workflow engine before treasury** (Wave 4 before 5): the allocation lifecycle is born on the engine, not migrated onto it later.
5. **Municipalities after funds** (Wave 6): a municipality's distinctive flows (funding agreements, executing-agency participation) need treasury and governance live.
6. **Transparency after there is something to show** (Wave 7).
7. **Contract last** (Wave 8): drop legacy paths only when all readers are gone.

## Dependency graph
```
W0 Foundations
 └─→ W1 Identity & Multi-Tenancy
      ├─→ W2 Organizations ──┐
      ├─→ W3 Governance ─────┼─→ W5 Treasury & Funds ─→ W6 Municipal ─→ W7 Reporting
      └─→ W4 Workflow ───────┘                                            │
                                     W8 Final Consolidation ←─────────────┘ (requires all)
```
W2/W3/W4 can overlap partially (different modules); W5 hard-requires W3 + W4.

## Wave summary table

| Wave | Doc | Delivers | New tables (owner) | Key legacy touchpoints | Debt repaired |
|---|---|---|---|---|---|
| 0 | 11 | Audit log, soft delete, event bus, ActorContext, regression suite | `AuditLog` | Cascade removal, delete endpoints | D4 |
| 1 | 12 | Organization substrate, scoped grants, policy engine (shadow), default-org backfill | `Organization`, `OrganizationMembership`, `RoleAssignment` | Auth/JWT context, guard shadow | D5 (begin) |
| 2 | 13 | Multi-org live: workspaces, NGO/team onboarding, project ownership, FK repairs | (columns: `ownerOrganizationId`, `projectRefId`×7, `*UserId` twins) | admin app shell, projects module | D1, D2 |
| 3 | 14 | Board org, decisions, generalized voting, review queue | `BoardDecision`, `VoteRound`, `Vote` | study approval dual-write, voting module | — |
| 4 | 15 | Workflow engine, lifecycle v1 parity, instances for all projects | `WorkflowDefinition/State/Transition/Instance/StepLog` | study/projects/donations status writes | D3 |
| 5 | 16 | Funds, double-entry ledger, allocations, donation routing | `Fund`, `FundMembership`, `Account`, `LedgerTransaction/Entry`, `FundAllocation` | donations/payments/financial modules | — |
| 6 | 17 | Municipality + youth-team GA, joint projects, agreements, reports, categories | `ProjectParticipation`, `FundingAgreement`, `ProgressReport`, `FinancialReport`, `ProjectCategoryNode` | category enums, study templates | enum merge |
| 7 | 18 | Public transparency portal, dashboards, exports | (read views only) | apps/web | — |
| 8 | 19 | Remove dual-writes/flags, drop legacy columns/tables, RLS, DB grants | (drops) | everything legacy | D1–D5 close |

## Cross-wave workstreams (continuous)
- **Regression suite** (born W0) grows every wave; it is the compatibility contract (`09`).
- **Audit coverage** expands with each new module (every new mutating action emits events from birth).
- **Seed script** updated every wave; seeded accounts always functional.
- **Admin app workspace shell** (born W2) gains a section per wave: governance (W3), workflow ops (W4), funds (W5), reports (W6).

## Estimation & staffing guidance
Waves are sized for a small team (2–4 devs) at roughly 2–6 weeks each; W4 and W5 are the heavy ones (engine parity, ledger backfill) — do not parallelize them with each other. Each wave doc's Definition of Done is the gate; a wave does not start while its dependency's DoD is unmet, except explicitly marked overlap (W2/W3/W4).

## Rules recap (from the brief)
- No production code in these docs — they specify, waves implement.
- Preserve existing functionality; backward compatibility per `09`.
- Incremental migration only; the system stays live throughout.
