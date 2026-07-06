# 16 — Wave 5: Treasury & Funds

## Goals
Money becomes a ledger: funds exist with real officers, every project has an account, donations post double-entry credits, fund→project allocations run on the workflow engine with Board approval, and the legacy per-project journal is superseded — with numbers proven equal before any reader switches.

## New tables / modules
- **`Fund`, `FundMembership`, `Account`, `LedgerTransaction`, `LedgerEntry`, `FundAllocation`** (shapes: `03` §3; `FundingAgreement` deferred to Wave 6 with municipalities).
- **`treasury` module**: the only writer of ledger tables; posting API (used by donation/payment/expense handlers), balance/statement queries, reconciliation views.
- **`funds` module**: fund CRUD (Board-gated), officer management (fund-scope `RoleAssignment`), policy JSON (thresholds), fund dashboards.
- Workflow: `fund-allocation` v1 definition **activated** (authored in Wave 4): `proposed → board_approved → disbursing → reconciled → closed`, with `board_decision` and fund-role guards.
- Fund workspace in `apps/admin` (context picker already handles it): dashboard, allocations, approvals, controller flag queue.

## What changes in the existing system
- **Accounts backfill:** an `Account` per existing project + platform cash/clearing accounts (Stripe, PayPal, physical cash-in).
- **Ledger backfill:** `ProjectTransaction` history reconstructed as ledger transactions where derivable (donations approved, expenses, adjustments); non-derivable residue posted as a documented opening-balance transaction per project. `ProjectTransaction` then **frozen read-only**.
- **Donation intake routing:** `donations` (QR approve) and `payments` (webhook complete) handlers emit events Treasury consumes to post credits — donor/employee UX and endpoints unchanged. New optional intake: fund-directed donations (donate to a fund, not a project) — additive endpoints.
- **`financial` module:** expense approval posts project-account debits; project financial pages switch to ledger-backed views **after** parity verification. Budget model (`ProjectBudget`) unchanged — budgets are plans, the ledger is fact.
- Initial funds created by the Board (e.g. Development & Infrastructure, Social Support, Relief & Emergency) with officers assigned — the first non-default organizational money structure.

## Migration strategy
- Ledger backfill follows `09`'s representation-replacement sequence with a **reconciliation gate**: for every project, `legacy journal net = ledger account balance` must hold exactly; discrepancies resolved and documented before cutover (snapshot before running; irreversible-flagged).
- Dual-write period: on new money events Treasury posts entries **and** appends legacy `ProjectTransaction` rows (new→old) until financial-page readers cut over; then legacy writes stop, table frozen.
- Allocation flow launches with a low ceiling (policy threshold forcing Board decision on every allocation) for the first cycle; thresholds relaxed after the first reconciled allocation.

## Risks
| Risk | Mitigation |
|---|---|
| Historical journal too messy to reconstruct | Opening-balance fallback is planned, not an emergency; residue documented per project and visible in statements |
| Double-posting (webhook retry, re-approval) | Posting API idempotent on (referenceType, referenceId, event); `WebhookLog` already dedupes provider events |
| Balance drift between legacy and ledger during dual-write | Nightly reconciliation job per project account; cutover blocked while ≠ 0 |
| Segregation-of-duties gaps (director self-dealing) | Threshold dual-approval + controller read/flag role enforced by policy engine (`08`); every allocation approval requires a `BoardDecision` above threshold |
| Currency handling surprises (`OnlineDonation.currency`) | Single-currency accounts; FX conversions are explicit posted transactions, never implicit |

## Dependencies
Wave 3 (Board decisions for allocations), Wave 4 (allocation workflow, `donations_open` gating), Wave 2 (D1 `projectRefId` for clean account↔project joins). Do not parallelize with Wave 4 (rule in `10`).

## Definition of done
- [ ] Every project has an account; ledger↔legacy reconciliation exact for 100% of projects; nightly job green through soak.
- [ ] QR donation approval and provider webhook completion produce balanced ledger postings (regression suite extended and green).
- [ ] Three initial funds live with officers; one **full allocation cycle** completed in production: proposed → Board decision → disbursed tranche → project spend → reconciled.
- [ ] Controller role verified: can read/flag everything in the fund, can approve/initiate nothing (permission test in suite).
- [ ] Project financial pages ledger-backed; `ProjectTransaction` frozen; legacy dual-write stopped.
- [ ] Fund dashboards live (balance, intake, allocations, spend by project).
