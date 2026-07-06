# 06 — Fund & Treasury System

## Purpose
Design the dynamic fund system (Development & Infrastructure, Social Support, Relief & Emergency, and any future fund) on top of a double-entry ledger, replacing the per-project money journal with a platform treasury that makes every currency unit traceable from intake to spend.

## Problems this document solves
- Money today attaches only to projects (`ProjectDonation`, `OnlineDonation`, `ProjectTransaction`); there is no pooled fund, no fund→project financing, no fund-level accountability.
- `ProjectTransaction` is a mutable free-form journal — inadequate for the "traceability of every financial transaction" requirement.
- Fund officers (director, deputy, secretary, accountant, controller) need real, segregated permissions.

## Key components

### Funds
- `Fund` with i18n name, purpose, status (`active | frozen | closed`), optional managing organization (Board-managed or delegated), and a `policy` JSON: spending limits, dual-approval thresholds, allowed project categories.
- `FundMembership` + `RoleAssignment(scope=fund)` for the five officer roles. **Segregation of duties is structural:** `fund_controller` can read everything and flag entries but holds no initiate/approve permission; approval above `policy.dualApprovalThreshold` needs director **and** deputy (or Board decision) — enforced by the policy engine, not convention.

### Ledger (double-entry core)
- `Account` per money-holding thing: each fund, each project, provider clearing accounts (Stripe/PayPal), external counterparties. Balances always derived from entries.
- `LedgerTransaction` (immutable header: actor, description, reference) with `LedgerEntry` rows that must sum to zero per transaction. Corrections are reversing transactions — never edits, never deletes.
- Only the Treasury module holds write access to these tables (module rule from `02`; DB-grant enforced in Wave 8).

### Money flows
```
Donor (QR physical)  → ProjectDonation approved  ─┐
Donor (Stripe/PayPal) → OnlineDonation completed ─┼→ Treasury posts credit:
Fund-directed donation (new, Wave 5)             ─┘   clearing/cash → project or fund account

Fund → Project:  FundAllocation
  proposed → board_approved → disbursing → reconciled → closed   (runs on workflow engine)
  each tranche = LedgerTransaction: fund account → project account
  approvedByDecisionId → BoardDecision (above-threshold allocations)

Project spend:  ProjectExpense approved → LedgerTransaction: project account → external
```
Multi-fund financing = multiple allocations to one project; the project account's credit history shows exactly which fund financed what. A municipality receiving funding = allocation to a project it executes, under a `FundingAgreement` (see `17`).

### Existing donation flows — preserved
`ProjectDonation` (QR token, employee scan, approve) and `OnlineDonation` (webhooks, `WebhookLog`) keep their tables, endpoints, and UX. The **only** change: the approval/completion handler additionally emits `donation.approved` / `payment.completed`, which Treasury consumes to post entries. Donors and employees notice nothing.

### Dashboards & controls
- Per-fund: balance, intake, allocations, disbursement schedule, spend by project/category, pending approvals, controller flags.
- Platform (Board): all funds, inter-fund comparisons, unreconciled items.
- Freeze semantics: `Fund.status = frozen` blocks new allocations/disbursements via policy, never hides history.

## What changes in the existing system
- `donations`, `payments`, `financial` modules: add event emission on approval/completion (small, isolated edits).
- `ProjectTransaction`: backfilled into ledger as opening-balance + reconstructed history (Wave 5), then frozen read-only; dropped Wave 8.
- Project financial pages read from ledger-backed views; numbers must reconcile with legacy views before cutover (parity check in Wave 5 DoD).

## Connections
- Entities: `03_DATA_MODEL.md` §3. Allocation approval: `07_GOVERNANCE_BOARD.md`.
- Officer permissions & thresholds: `08_PERMISSIONS_RBAC_ABAC.md`.
- Allocation state machine: `04_WORKFLOW_ENGINE.md`. Execution: `16_WAVE_5_TREASURY_FUNDS.md`.
