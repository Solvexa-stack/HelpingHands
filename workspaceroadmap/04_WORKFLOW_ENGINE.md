# 04 — Workflow Engine Design

## Purpose
Turn the hardcoded lifecycle enums (D3) into a table-driven, versioned state machine so new flows (Board review, municipal variants, emergency fast-track) are configuration, not migrations — while the existing lifecycle keeps behaving exactly as it does today.

## Problems this document solves
- Every process change today = enum migration + edits across services (`study`, `voting`, `projects`, `donations`). This makes governance evolution expensive and risky.
- Voting and approval logic is welded to studies; the Board needs the same mechanics on allocations, organization verification, and policies.
- No authoritative answer to "who may move this project forward, and what happened when" — required for transparency.

## Key components

### Data model
```
WorkflowDefinition   key ("project-lifecycle"), version, subjectType, isActive
WorkflowState        definitionId, key, kind: initial | normal | terminal, metadata
WorkflowTransition   definitionId, fromStateKey, toStateKey, actionKey
                     guards JSON (list of named guard refs + params)
                     effects JSON (domain events to emit on success)
WorkflowInstance     definitionId + version (pinned), subjectType/subjectId, currentStateKey
WorkflowStepLog      instanceId, transition, actorUserId, timestamp, note  (append-only)
```

### Engine API (the only three operations)
- `start(subject, definitionKey)` → creates instance at initial state.
- `availableTransitions(instance, actor)` → transitions whose guards pass for this actor now.
- `execute(instance, actionKey, actor, payload)` → re-checks guards atomically, moves state, writes `WorkflowStepLog`, emits effects. All in one DB transaction.

### Guards — code handlers, data usage
Guard *types* are registered handlers; *which guards apply where* is rows:
```
{type:"role",            scope:"organization", role:"project_manager"}
{type:"role",            scope:"platform",     role:"board_member"}
{type:"vote_passed",     roundRef:"study-vote"}
{type:"board_decision",  decision:"approved"}
{type:"capability",      participant:"executing_agency", cap:"canExecuteProjects"}
{type:"sections_complete"}          {type:"window_open", field:"voting"}
```
Guard evaluation delegates role/capability checks to the policy engine (`08`) — one authorization brain, two entry points.

### Effects
Named domain events emitted on successful transition: `donations.open`, `vote_round.create`, `study.approved`, `project.closed`. Subscribers (Treasury, Governance, Notifications, Audit) react; the engine knows event names, not module internals.

## Preserving the current lifecycle: `project-lifecycle` v1
Transcribed 1:1 from today's `StudyStatus` machine plus project flags:
```
draft → in_review → published → voting_open → voting_closed
      → approved → donations_open → executing → completed
   (rejected reachable from in_review and voting_closed)
```
Guards encode exactly what services enforce now (creator role, voting window, admin approval). **v1 changes no behavior by construction** — parity is verified by replaying the regression suite from Wave 0 against engine-driven transitions.

## Compatibility bridge (Wave 4, removed Wave 8)
- Instances are started for **all existing projects**, positioned by deriving state from `studyStatus` + `isCompleted` + donation-open flags.
- Engine effects **dual-write legacy enum columns** so untouched readers (web project pages, dashboard queries) stay correct.
- Services migrate one at a time from flipping enums to calling `execute(...)`; a temporary lint/CI rule flags direct writes to migrated status columns.

## Extending without breaking
- **New version**: `project-lifecycle` v2 inserts `board_review` between `voting_closed` and `approved`, adds `executing_org_assigned` guard. Running instances stay pinned to v1; new projects start on the definition selected by owner-org type/capabilities.
- **New definition**: `emergency-relief` v1 (no voting, Board fast-track); `org-verification` v1 (Wave 6 onboarding); `fund-allocation` v1 (proposed → board_approved → disbursing → reconciled → closed, Wave 5).
- Voting integrates as a pattern: entering a `*_voting` state emits `vote_round.create`; leaving requires `vote_passed`. The engine doesn't know what a vote is — a guard handler answers.

## System impact
- New `workflow` module in `apps/api/src/modules/`; admin app gains a definition viewer (read-only first) and transition buttons driven by `availableTransitions`.
- `study`, `voting`, `projects` services progressively become thin domain layers around engine calls.

## Connections
- Guard authorization: `08_PERMISSIONS_RBAC_ABAC.md`.
- Vote rounds & Board decisions consumed by guards: `07_GOVERNANCE_BOARD.md`.
- Allocation workflow instance: `06_FUND_AND_TREASURY_SYSTEM.md`.
- Execution wave: `15_WAVE_4_WORKFLOW_ENGINE.md`.
