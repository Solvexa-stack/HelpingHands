# Backlog — Wave 5: Treasury & Funds
Source: [`../16_WAVE_5_TREASURY_FUNDS.md`](../16_WAVE_5_TREASURY_FUNDS.md) · Numbers must reconcile before any reader switches.

---

## Epic W5-E1 — Treasury schema

**S1 · M · db — `Account`, `LedgerTransaction`, `LedgerEntry`**
Do: Migration per `../03` §3; single-currency accounts; ledger tables immutable by convention (app-level; DB grants in W8); indexes for statement queries.
AC: Migrations apply; balanced-entries invariant expressible as a check in the posting service tests.
Deps: W4 done

**S2 · M · db — `Fund`, `FundMembership`, `FundAllocation`**
Do: Migration: fund with `policy` JSON + status, membership, allocation with status chain + `approvedByDecisionId → BoardDecision`.
AC: Migrations apply.
Deps: S1

## Epic W5-E2 — `treasury` module (sole ledger writer)

**S1 · L · api — Posting API**
Do: `post(transaction, entries[])`: validates zero-sum, single-currency per account, writes atomically; **idempotent on `(referenceType, referenceId, event)`**; emits `ledger.posted`. Module boundary: no other module imports ledger models (lint).
AC: Unit tests: unbalanced rejected; replay returns original transaction without duplicate; lint rule active.
Deps: E1-S1

**S2 · M · api — Balances, statements, reconciliation views**
Do: Derived balance query per account; statement (entries with running balance, period filters); reconciliation view (legacy journal net vs. ledger balance per project).
AC: Statement math property-tested; reconciliation view drives E4 gate.
Deps: S1

## Epic W5-E3 — `funds` module

**S1 · M · api — Fund CRUD + officer management**
Do: Board-gated fund create/update/freeze/close; officer roles via `RoleAssignment(scope=fund)` (director, deputy, secretary, accountant, controller); all audited.
AC: Freeze blocks new allocations/disbursements via policy (spec); history untouched.
Deps: E1-S2, W1-E4

**S2 · M · api — Policy thresholds & segregation of duties**
Do: Policy conditions per `../08`: approve ≤ threshold → director; above → +deputy co-approval or Board decision; controller = read+flag only, no initiate/approve anywhere.
AC: Permission spec matrix for all five officer roles (becomes permanent suite member); controller restriction verified.
Deps: S1

## Epic W5-E4 — Backfill & reconciliation gate

**S1 · M · migration — Accounts backfill**
Do: `Account` per existing project + platform cash/clearing accounts (Stripe, PayPal, physical cash-in).
AC: Every project has exactly one account; idempotent.
Deps: E1-S1

**S2 · L · migration — Ledger reconstruction from `ProjectTransaction`**
Do: Written derivation rule per transaction type (income/expense/refund/adjustment ↔ donation/expense references); non-derivable residue → documented opening-balance transaction per project; **DB snapshot before run** (irreversible-flagged per `../09`).
AC: Reconciliation gate: `legacy net = ledger balance` exact for 100% of projects; discrepancy log resolved and archived.
Deps: S1, E2-S2

**S3 · S · api,infra — Freeze `ProjectTransaction` + dual-write + nightly reconciliation**
Do: Direct writes blocked; during transition Treasury appends legacy rows (new→old) on new money events; nightly per-account reconciliation job (until reader cutover, then until W8 in verify-frozen mode).
AC: Attempted direct write fails (test); nightly job green.
Deps: S2

## Epic W5-E5 — Money-event routing

**S1 · M · api — Donation & payment intake posting**
Do: `donation.approved` (QR) and `payment.completed` (webhook) consumed by Treasury → post credit (clearing/cash → project account). Endpoints and donor/employee UX unchanged.
AC: Regression donation specs green unmodified; each approval/completion yields exactly one balanced posting (replay-safe via E2-S1).
Deps: E2-S1, E4-S1

**S2 · M · api — Expense posting**
Do: `expense.approved` → project-account debit to external counterparty; `financial` module emits, Treasury posts.
AC: Expense approval reflected in account statement; budget model untouched.
Deps: S1

**S3 · S · api,web-ui — Fund-directed donations (additive)**
Do: New intake endpoints + web flow variant: donate to a fund (not a project); posts to fund account.
AC: Fund donation e2e (online channel); appears in fund statement.
Deps: E3-S1, S1

## Epic W5-E6 — Allocation lifecycle

**S1 · M · api — Activate `fund-allocation` workflow**
Do: Activate the W4-authored definition: proposed → board_approved (`board_decision` guard) → disbursing → reconciled → closed; allocation CRUD in `funds` module starts instances; disbursement tranches call Treasury posting (fund → project account).
AC: E2E spec: full chain incl. Board decision and two tranches; states visible in timeline UI.
Deps: E3-S2, E5, W4-E6-S1, W3-E2-S1

**S2 · S · api — Launch ceiling**
Do: Initial fund policies force Board decision on every allocation (threshold=0); relaxation path documented (Board-audited policy change).
AC: Allocation without decision impossible at launch (spec).
Deps: S1

## Epic W5-E7 — Fund workspace UI

**S1 · L · admin-ui — Fund dashboard & operations**
Do: Fund context in workspace shell: dashboard (balance, intake, allocations, spend by project), allocation screens (propose/approve per role), statement view, controller flag queue; Board view: all funds + pending decisions (feeds W3 queue).
AC: Each officer role sees exactly its permitted actions (driven by `can()`/`availableTransitions`); dashboard numbers match statement queries.
Deps: E3, E6-S1

## Epic W5-E8 — Cutover, initial funds, wave close

**S1 · M · api,admin-ui — Project financial pages → ledger-backed**
Do: Switch project financial reads to ledger views after reconciliation gate green through soak; stop legacy dual-write; `ProjectTransaction` fully frozen.
AC: Displayed numbers identical pre/post cutover (recorded comparison); flag rollback available during soak.
Deps: E4-S3, E5

**S2 · M · migration,docs — Create initial funds + first real allocation cycle**
Do: Board creates Development & Infrastructure, Social Support, Relief & Emergency funds with officers; run one full production allocation cycle (propose → decide → disburse → spend → reconcile).
AC: Wave-doc DoD "full allocation cycle" bullet satisfied with evidence.
Deps: E6, E7

**S3 · S · qa,docs — Wave close**
Do: Regression + reconciliation evidence; DoD walk; `PROGRESS.md` (W5 ✅).
AC: Checked with evidence.
Deps: all
