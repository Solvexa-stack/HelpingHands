# 14 — Wave 3: Governance Board

## Goals
The Board becomes operational: an immutable decision record on every approval, generalized voting replacing study-only voting, and a cross-organization review queue — while the study approval flow keeps its exact current behavior and endpoints.

## New tables / modules
- **`BoardDecision`**, **`VoteRound`**, **`Vote`** (shapes: `03` §4; all immutable).
- **`governance` module**: decision recording (rationale mandatory), vote-round lifecycle (open/close, eligibility, quorum/threshold evaluation), review-queue queries.
- **Board workspace** in `apps/admin` (extends the Wave 2 shell): review queue (studies awaiting review, projects awaiting approval), decision screens with rationale, vote-round management, decision history.

## What changes in the existing system
- **`voting` module refactor:** `StudyVote` data migrated into `VoteRound(subject=ProjectStudy)` + `Vote` rows; endpoints keep request/response contracts, now reading/writing the generalized model. `StudyVote` table frozen read-only.
- **Study approval dual-writes:** approving/rejecting a study (currently `ProjectStudy.approvedById/approvedAt/rejectionReason`) additionally records `BoardDecision(subject=project_study)`. Legacy columns synced from the decision (new→old, per `09`).
- Voting windows (`votingStartsAt/EndsAt`) become `VoteRound.opensAt/closesAt`; the study service reads them through the round. Reminder logic (`reminderSentAt`) moves to round-scoped notifications.
- Eligibility: current behavior (which users may vote today) is transcribed as the default eligibility policy — **no expansion of the electorate this wave.**
- Board members (per Wave 1 grants) gain the governance workspace; `administrator` seeded account continues approving studies through the same screens, now producing decision records.

## Migration strategy
- `StudyVote → VoteRound/Vote` follows the "replacing a representation" sequence (`09`): backfill one round per study with voting history, verification asserts per-study vote counts and per-choice tallies match exactly; shadow-read tallies compared until divergence 0; then cutover, freeze.
- Decision dual-write is new→old only; nightly parity check `ProjectStudy.approvedById ↔ BoardDecision` until Wave 8.
- No workflow-engine dependency: decisions/votes are recorded by the existing service flow now, and become guard inputs when Wave 4 lands (designed for it, not blocked on it).

## Risks
| Risk | Mitigation |
|---|---|
| Vote tally drift after migration | Deterministic backfill + tally verification query; shadow-read window before cutover |
| Rationale requirement slows operators | Templated rationales for routine approvals; requirement is the point (accountability), communicated ahead |
| Governance UX bypassed (old habits) | Legacy approval endpoints internally route through the governance service — there is no non-decision path left |
| Quorum/threshold config errors void a vote | Default policy = exact current behavior; config changes require `board_chair` + audit; round results reviewable before close is finalized |

## Dependencies
Wave 1 (Board org + platform grants). Wave 2 workspace shell for the Board UI (queue placeholder exists from Wave 2). Overlappable with Wave 4 development per `10`.

## Definition of done
- [ ] Every study approval/rejection in production produces a `BoardDecision` with rationale; parity check green.
- [ ] Historical votes migrated; tallies verified equal; voting endpoints byte-compatible (regression suite green unmodified).
- [ ] A full study voting cycle (open → votes → close → tally → approve) runs end-to-end on `VoteRound`/`Vote` with `StudyVote` frozen.
- [ ] Board workspace live: cross-org queue, decision recording, decision/vote history views.
- [ ] `changes_requested` decision path exercised: study returns to revision with rationale visible to the owning org.
- [ ] Audit trail shows decision + votes for a complete cycle (spot-audited).
