# Backlog — Wave 9: Fund Hierarchy & Sector Governance

Traces to [20_WAVE_9_FUND_HIERARCHY_AND_SECTOR_GOVERNANCE.md](../20_WAVE_9_FUND_HIERARCHY_AND_SECTOR_GOVERNANCE.md).
Conventions: [BACKLOG_00_OVERVIEW.md](BACKLOG_00_OVERVIEW.md).

Epics E1–E3 were already implemented before this backlog was written (commit `245e223`,
undocumented — see the wave doc's Provenance section) and are recorded here as DONE for
traceability. E4–E7 are the gap-closing pass.

## E1 — Fund hierarchy engine (DONE, pre-dates this backlog)
- S1 · M · `db`/`api` — `FundHierarchyService`: idempotent master-fund-per-sector, org-fund-per-org×sector, mirroring taxonomy nesting. Do: `apps/api/src/modules/fund-hierarchy`. AC: `w9-fund-hierarchy.e2e-spec.ts` green.
- S2 · S · `api` — `Project.primaryFundId` auto-resolution at creation (defaultFundId). Do: `ProjectsService.create`. AC: same spec, "Automatic fund creation" describe block.
- S3 · M · `api` — Auto-allocation on direct project donations routed through the default fund. Do: `MoneyEventsSubscriber.routeProjectIncomeThroughDefaultFund`. AC: same spec, "Direct project donation auto-allocation" describe block.

## E2 — Fund financial extension (DONE, pre-dates this backlog)
- S1 · L · `db`/`api` — `Donor`/`Recipient`/`Invoice`/`Expense`/`FundDonation` models + modules. Do: `apps/api/src/modules/donors`, `.../expenses`. AC: `w8-fund-financial-extension.e2e-spec.ts` green.
- S2 · M · `admin-ui` — `/donors`, `/expenses` admin pages. Deps: E2-S1.

## E3 — Admin fund hierarchy view (DONE, pre-dates this backlog)
- S1 · S · `admin-ui` — Read-only tree view. Do: `apps/admin/src/app/(dashboard)/funds/hierarchy`. Deps: E1.

## E4 — Super Admin & sector CRUD
- S1 · S · `db`/`api` — `platform:super_admin` role; seed grant. Do: `role-catalog.ts`, `w1-identity-backfill.ts`. AC: seeded administrator holds `super_admin`.
- S2 · M · `api` — Sector CRUD (`create`/`update`/`archive`/`activate`), `sector.manage` policy action, no delete route. Do: `apps/api/src/modules/categories`. AC: `w9-sector-governance.e2e-spec.ts`, "Sector CRUD" describe block.
- S3 · M · `admin-ui` — `/categories` management page. Deps: E4-S2.

## E5 — Master-fund hardening & fund suggestion
- S1 · S · `api` — `POST /funds` type=master requires categoryId + Super Admin, delegates to `FundHierarchyService.ensureMasterFund`. Do: `FundsService.create`. AC: `w9-sector-governance.e2e-spec.ts`, "Master-fund creation is hardened" describe block.
- S2 · M · `api` — `GET /funds/suggested` + `fund.suggest` policy action. Do: `FundHierarchyService.suggestedFunds`, `FundsController`. AC: same spec, "GET /funds/suggested" describe block.
- S3 · S · `admin-ui` — Fund picker in project creation. Do: `components/ui/fund-picker.tsx`, `projects/new/page.tsx`. Deps: E5-S2.

## E6 — Segregation of duties
- S1 · S · `api` — Creator ≠ approver on expense/fund-donation decisions, Council/Board-exempt. Do: `ExpensesService.decide`, `FundsService.decideDonation`. AC: `w9-sector-governance.e2e-spec.ts`, "Segregation of duties" describe block. No migration — both models already track `createdByUserId`.

## E7 — Sector reporting & public browsing
- S1 · M · `api` — `GET /transparency/sectors/:id` + `sector.totals` publication-policy class. Do: `TransparencyReadService.sectorPublic`, `TransparencyController`. AC: `w9-sector-governance.e2e-spec.ts`, "GET /transparency/sectors/:id" describe block.
- S2 · M · `web-ui` — Public `/sectors` + `/sectors/[id]` pages. Do: `apps/web/src/app/[locale]/sectors`. Deps: E7-S1.
- S3 · S · `web-ui` — Public donate-to-fund (online). Do: generalize `OnlineDonateButton`; CTA on the fund transparency page. Backend already supported `OnlineDonation.fundId` since Wave 5 — UI-only.

## Definition of Ready / Done
Same as [BACKLOG_00_OVERVIEW.md](BACKLOG_00_OVERVIEW.md). No feature flag introduced this
wave — every change is either additive-only (new routes/tables) or a stricter check on an
already Board-gated route (master-fund creation), so there is no flagged rollback path;
rollback is a normal revert.
