# Backlog — Wave 3: Governance Board & Voting
Source: [`../14_WAVE_3_GOVERNANCE_BOARD.md`](../14_WAVE_3_GOVERNANCE_BOARD.md)

---

## Epic W3-E1 — Governance schema

**S1 · M · db — `BoardDecision`, `VoteRound`, `Vote` tables**
Do: Migration per `../03` §4: decisions immutable (no update path in app code), rounds with eligibility/quorum JSON, votes unique per `(voteRoundId, userId)`; indexes on subject lookups.
AC: Migrations apply; immutability convention documented on the models.
Deps: W1 done

## Epic W3-E2 — `governance` module

**S1 · M · api — Decision recording**
Do: Service + endpoints: record decision (`approved|rejected|changes_requested`) on a subject; rationale mandatory; `board_chair`/`board_member` policy-gated via `@Can`; emits `board.decision.recorded`.
AC: Decision without rationale rejected (422); recorded decision immutable (no update/delete endpoints); audited.
Deps: E1-S1

**S2 · L · api — Vote-round lifecycle**
Do: Open/close rounds on a subject with eligibility policy (default = transcription of current study-vote eligibility), quorum/threshold rules JSON; cast vote (choice+comment, once per user); tally + result evaluation at close; emits `vote_round.opened/closed`, `vote.cast`.
AC: E2E spec: open → eligible votes accepted, ineligible rejected, duplicates rejected → close → tally + pass/fail recorded on round.
Deps: E1-S1, W1-E4

**S3 · S · api — Round-scoped reminders**
Do: Move study `reminderSentAt` logic to round-scoped notifications (existing `notifications`/`email` modules).
AC: Reminder fires for open round with missing eligible voters; legacy field left synced.
Deps: S2

## Epic W3-E3 — StudyVote migration & voting refactor

**S1 · M · migration — Backfill `StudyVote` → `VoteRound`/`Vote`**
Do: One round per study with voting history (window fields → opensAt/closesAt); votes copied; verification: per-study vote counts and per-choice tallies exactly equal; reverse script written.
AC: Verification query clean over all historical studies; staging rehearsal before production.
Deps: E2-S2

**S2 · M · api — `voting` module refactor (shadow-read → cutover)**
Do: Voting endpoints keep contracts, internally read/write rounds; shadow-read compares legacy vs. round tallies until divergence 0, then cutover; `StudyVote` frozen read-only (writes blocked).
AC: Regression suite (W0-E1-S2) green **unmodified**; freeze verified by attempted-write test.
Deps: S1

## Epic W3-E4 — Study approval dual-write

**S1 · M · api — Approval routes through governance**
Do: Study approve/reject internally records `BoardDecision(subject=project_study)` and syncs legacy `approvedById/approvedAt/rejectionReason` (new→old). No non-decision approval path remains.
AC: Every approval/rejection produces a decision; legacy columns identical to before (regression green unmodified).
Deps: E2-S1

**S2 · S · infra — Nightly decision↔legacy parity job**
Do: Compare `ProjectStudy.approvedById` columns against decisions; alert on drift; runs until Wave 8.
AC: Green nightly; alert tested.
Deps: S1

**S3 · M · api — `changes_requested` path**
Do: Decision `changes_requested` returns study to revision (per current status model: back to `in_review`/`draft` per wave doc) with rationale attached and visible to the owning org; notification emitted.
AC: E2E spec: request-changes → study editable again → rationale shown → resubmit → approve.
Deps: S1

## Epic W3-E5 — Board workspace UI

**S1 · L · admin-ui — Review queue**
Do: Board workspace (extends W2 shell): cross-org queue of studies awaiting review and projects awaiting approval, with org, category, age; filters; links to detail.
AC: Items appear/disappear as statuses change (spec); org users cannot access.
Deps: W2-E5-S3, E4-S1

**S2 · M · admin-ui — Decision & voting screens**
Do: Decision screen (subject summary, rationale editor, templated rationales); vote-round management (open/close, live tally for chair/secretary); member voting UI; decision + vote history views per subject.
AC: Full cycle operable from UI: queue → open round → vote → close → decide; history complete.
Deps: S1, E2-S2

## Epic W3-E6 — Wave close

**S1 · M · qa — Governance cycle E2E (permanent)**
Do: Spec: full study voting cycle on rounds with `StudyVote` frozen; decision records asserted; audit trail spot-check (decision + all votes present).
AC: In permanent suite; green.
Deps: all epics

**S2 · S · docs — DoD walk**
Do: Wave-doc DoD checklist; `PROGRESS.md` (W3 ✅); parity jobs inventoried.
AC: Checked with evidence.
Deps: S1
