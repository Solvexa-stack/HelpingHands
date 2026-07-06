# 07 — Governance Board

## Purpose
Model the Board as the platform's central authority: reviewing projects across all organizations, deciding on approvals and fund allocations, controlling voting — through recorded, immutable decisions rather than superuser powers.

## Problems this document solves
- Today the closest thing to the Board is the `administrator` enum value — an unaccountable global superuser with no decision records, no queue, no quorum.
- Study voting is the only voting mechanism and is hard-wired to `ProjectStudy`.
- "Highest authority" must mean *governance permissions + full read*, not raw write access into every organization's data (that would destroy the audit story).

## Key components

### The Board as an Organization
`Organization(type=board)`, exactly one active instance. Board members are `OrganizationMembership` rows whose users hold `RoleAssignment(scope=platform)` roles:
- `board_chair` — decide, open/close vote rounds, convene sessions.
- `board_member` — vote, review, propose decisions.
- `board_secretary` — manage queue/sessions, record rationale; no vote.
- `platform_auditor` — read + flag everywhere; no governance verbs.

Using the same organization mechanism means membership management, workspace UX, and audit come free — no parallel "board admin" subsystem.

### BoardDecision (immutable)
```
subjectType/subjectId: project | project_study | fund_allocation | organization | policy
decision: approved | rejected | changes_requested
rationale (required), decidedAt, sessionRef, voteRoundId?
```
Decisions are consumed as **workflow guards** (`{type:"board_decision", decision:"approved"}`): the subject's workflow cannot advance without the matching decision row. `changes_requested` routes the workflow back to a revision state with the rationale attached.

### Generalized voting
- `VoteRound(subjectType/subjectId, opensAt, closesAt, eligibility, quorum/threshold rules)` + immutable `Vote(choice, comment, unique per user per round)`.
- Eligibility is a policy expression: board members only, an organization's members, or a configured group — this is how "Board controls voting workflows" becomes data.
- Existing `StudyVote` data migrates into rounds (Wave 3); study voting UX unchanged, now reading/writing through the generalized model.
- Quorum/threshold evaluated by the `vote_passed` guard handler at close time; results recorded on the round.

### Review queue (Board workspace in apps/admin)
Cross-organization inbox: studies awaiting review, projects awaiting approval, allocations awaiting decision (Wave 5+), organizations awaiting verification (Wave 6+). Backed by workflow instances sitting in states whose transitions carry board guards — the queue is a query, not a parallel bookkeeping table.

### Cross-system access
Board read-everywhere is an explicit policy grant (`platform` scope ⇒ tenancy filter bypass for reads), logged per access category. Board write into org data does not exist; the Board acts on the world through decisions, vote rounds, capability changes, and fund/organization status changes — all audited verbs.

## What changes in the existing system
- The study approval step (`ProjectStudy.approvedById`) starts dual-writing a `BoardDecision(subject=project_study)`; legacy column kept in sync until Wave 8.
- `voting` module refactors onto `VoteRound`/`Vote`; endpoints keep their contracts.
- Seeded `administrator` account maps to `board_chair` + platform grants (Wave 1 backfill) so day-one operations continue seamlessly.

## Connections
- Decision/vote entities: `03_DATA_MODEL.md` §4. Guards consuming them: `04_WORKFLOW_ENGINE.md`.
- Platform-scope permissions: `08_PERMISSIONS_RBAC_ABAC.md`.
- Execution: `14_WAVE_3_GOVERNANCE_BOARD.md`; allocation decisions activate in `16_WAVE_5_TREASURY_FUNDS.md`.
