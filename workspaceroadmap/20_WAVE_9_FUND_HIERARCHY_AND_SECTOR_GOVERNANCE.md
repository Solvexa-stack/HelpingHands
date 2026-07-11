# 20 — Wave 9: Fund Hierarchy & Sector Governance

## Provenance

This wave was already substantially built and merged (commit `245e223`, migrations
`20260711140242_w8_fund_financial_extension`, `20260711135923_w8_council_org_type`,
`20260711155550_w9_fund_hierarchy`, `20260711155600_w9_fund_hierarchy_dedup_indexes`,
`20260711163434_w9_auto_allocation_flag`) before this document existed — the commit
message was generic (`"test"`) and `PROGRESS.md` was never updated, so the work was
invisible to anyone reading the roadmap. This doc records what shipped, then what a
follow-up gap-closing pass added on top. Written after the fact; treat the "Shipped"
section as ground truth for the code, not as a plan.

Unlike Wave 8 (`19_WAVE_8_FINAL_CONSOLIDATION.md`, pure legacy contraction, gated on a
30-day quiet period), Wave 9 is additive new domain capability and does not depend on
Wave 8 landing first — the two are independent.

## Goal

Make sectors, the fund hierarchy, and project funding dynamic and permission-controlled,
per the "dynamic governance and funding system" request: Super Admin owns system
structure (sectors, master funds), Council (= Board, see decision log) owns approvals,
organizations execute, citizens fund transparently. Explicitly additive — never touches
`LedgerTransaction`, `LedgerEntry`, `FundAllocation`, or the existing donation/approval
flows.

## Shipped (commit `245e223`, pre-dating this doc)

- **`FundHierarchyService`** (`apps/api/src/modules/fund-hierarchy`): one Master Fund
  per `ProjectCategoryNode` (sector), mirroring the taxonomy's own nesting; one
  Organization Fund per org × sector, parented under that sector's master fund.
  Idempotent find-or-create throughout; a DB partial unique index
  (`funds_one_master_per_category`) backstops the invariant against create-races.
- `Project.primaryFundId` ("fund of record", added Wave 6) doubles as the spec's
  `defaultFundId`: resolved automatically at project creation from the owning org's
  fund for the chosen sector (`ProjectsService.create`), explicit `fundId` always wins.
- `MoneyEventsSubscriber` routes direct project donations through the project's default
  fund when set (auto `FundAllocation`, `isAutoAllocated: true`, created already
  `reconciled`) — donors experience "give to a project," the ledger always flows
  fund → project.
- Wave 8 fund financial extension: `Donor`, `Recipient`, `Invoice`, `Expense`,
  `FundDonation` — the `donors`/`expenses` API modules and matching admin pages
  (`/donors`, `/expenses`, `/funds`, `/funds/hierarchy`).
- `FundType.council` + `OrganizationType.council` exist at the schema level (unused by
  application logic — see the Council decision below).

## Added in this pass (gap-closing)

Full gap analysis is in the session that authored this doc; summary of what was found
missing and closed:

1. **Super Admin role** — new `platform:super_admin` `RoleAssignment`, separate from
   `board_chair` (`role-catalog.ts`). Granted to the seeded `administrator` account
   alongside `board_chair` via `ROLE_GRANT_MAPPING` in the W1 identity backfill (the
   only account that backfill maps from `AdminRole.administrator`).
2. **Sector CRUD** (`apps/api/src/modules/categories`) — `create`/`update`/`archive`/
   `activate`, gated to the new `sector.manage` policy action (Super Admin only). No
   delete method exists anywhere in the stack — archive (`isActive: false`) is the only
   way to retire a sector, so financial history referencing it is never orphaned.
   Admin UI at `apps/admin/src/app/(dashboard)/categories`.
3. **Master-fund creation hardened** — `POST /funds` with `type: master` now requires
   `categoryId`, requires `platform:super_admin` (checked in `FundsService.create` via
   `PolicyService.holdsAnyGrant`, defense-in-depth on top of the route-level
   `fund.manage` gate), and delegates to `FundHierarchyService.ensureMasterFund` instead
   of a raw create — closes the "stray category-less master fund" gap the generic
   endpoint previously allowed.
4. **`GET /funds/suggested`** — read-only "what would fund a project in this sector"
   preview (`FundHierarchyService.suggestedFunds`): the sector's master fund, the org's
   fund for that sector, and any council/donor funds already scoped to it. New
   `fund.suggest` policy action grants organization-scope roles a narrow, non-sensitive
   read `fund.read` never did. Wired into the admin project-creation fund picker
   (`components/ui/fund-picker.tsx`).
5. **Segregation of duties** — `ExpensesService.decide()` and `FundsService.decideDonation()`
   now reject when the actor created the expense/donation they're trying to approve,
   *unless* they hold platform-scope oversight (`board_chair`/`board_member`/
   `super_admin`) — Council/Board oversight is the exemption, not another thing blocked
   by the rule. No schema change: both models already tracked `createdByUserId`.
6. **Sector reporting** — `GET /transparency/sectors/:id` (public, cached/event-invalidated
   like every other transparency aggregate): total donations, allocated, spent, remaining
   balance, active projects, rolled up over the sector and its descendants. New
   `sector.totals` publication-policy field class (seeded public).
7. **Public sector browsing** (`apps/web/src/app/[locale]/sectors`) and **public
   donate-to-fund** — the backend already supported fund-directed online donations
   (Wave 5, `OnlineDonation.fundId`); only the public UI never exposed it.
   `OnlineDonateButton` generalized to accept a fund target; a "Donate to this Fund" CTA
   was added to the existing public fund page.

## Decision log

| Decision | Rationale |
|---|---|
| Super Admin is a new, separate `platform:super_admin` role, not `board_chair` extended | The spec gives Super Admin (structure: sectors, master funds, system config) and Council (approvals) explicitly different powers; conflating them into one role loses that separation. User-confirmed. |
| Council = Board, relabeled — no new governance tables/roles | `BoardDecision`/`board_chair`/`board_member` already do exactly what the spec asks of Council (org/project/fund/allocation/expense approval). A parallel governance body would duplicate Wave 3/6 for no behavioral gain. User-confirmed. No UI copy rename ("Board" → "Council") is included — cosmetic, separate from this pass. |
| No sector delete endpoint, ever | "Do not allow deleting sectors with financial history" (spec §1) — solved structurally (no delete surface at all) rather than with a runtime financial-history check, matching the archive/status convention already used for `Fund`/`Organization`. |
| Master-fund creation delegates to `FundHierarchyService`, doesn't get its own code path | Two independent creators of "the sector's master fund" is exactly the duplicate-fund risk the spec warns against ("avoid creating unnecessary funds", §3). One idempotent creator, called from both the auto-provisioning path (project creation) and the explicit admin path. |

## Definition of done

- [x] Sector CRUD (Super Admin only), no delete surface — `apps/api/test/w9-sector-governance.e2e-spec.ts`
- [x] Master-fund creation requires categoryId + Super Admin, idempotent
- [x] `GET /funds/suggested` — project-creation fund picker wired in admin
- [x] Segregation of duties on expense/fund-donation approval, Council-exempt
- [x] Sector report endpoint + public sector browsing + public fund donation
- [ ] Staging/production deploy of this pass
- [ ] Council terminology review with the Board — confirm no UI copy change is actually wanted before closing this item permanently
