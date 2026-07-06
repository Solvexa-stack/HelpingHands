# 15 — Wave 4: Workflow Engine

## Goals
The lifecycle becomes data: engine tables live, `project-lifecycle` v1 transcribed with **verified behavioral parity**, every existing project gets a correctly-positioned instance, and services flip statuses only through the engine. New definitions (v2 with Board review, emergency fast-track) become possible — but parity ships before any of them.

## New tables / modules
- **`WorkflowDefinition`, `WorkflowState`, `WorkflowTransition`, `WorkflowInstance`, `WorkflowStepLog`** (shapes: `04`).
- **`workflow` module**: the three-operation engine (`start`, `availableTransitions`, `execute`), guard-handler registry (`role`, `capability`, `vote_passed`, `board_decision`, `sections_complete`, `window_open`), effect emitter (domain events).
- Definitions seeded as data: `project-lifecycle` v1 (exact transcription of today's `StudyStatus` machine + donation/execution/closure stages, per `04`).
- Admin app: definition viewer (read-only), instance timeline on project pages, transition actions rendered from `availableTransitions`.

## What changes in the existing system
- **Instance backfill:** every project gets an instance positioned by a written derivation rule over `studyStatus` + `isCompleted` + donation-open state. Ambiguous legacy combinations are enumerated, resolved, and recorded in the backfill script's derivation table.
- **Dual-write bridge:** engine transitions sync legacy enum columns (`studyStatus` etc.) so untouched readers (`apps/web` pages, dashboard, reports module) stay correct without changes.
- **Service migration, one at a time:** `study` (draft→review→publish→approve), `voting` (open/close → transitions with `vote_passed` guard, round creation as effect), `projects`/`donations` (donations-open gating), `execution` (executing→completed). Each migrated service stops writing its status column directly; CI lint flags direct writes to migrated columns.
- Wave 3's decisions/votes plug in as guard inputs: the approval transition carries `{type:"board_decision", decision:"approved"}` — same behavior, now declared.

## Migration strategy
- "Replacing a representation" sequence (`09`), with the strongest parity gate in the program:
  1. Engine + v1 ship dark (no callers).
  2. **Parity harness:** the Wave 0 regression suite runs twice — legacy path vs. engine path — asserting identical status sequences, side effects (events emitted), and endpoint responses.
  3. Instance backfill (staging rehearsal → production), verification: every project's `currentState` maps back to its legacy columns exactly.
  4. Per-service cutover behind flags, one service per deploy, soak between.
- v2 definitions (board_review step, municipal variants, `emergency-relief`, `org-verification`, `fund-allocation`) are **authored but not activated** this wave; activation belongs to Waves 5/6 with their owners.

## Risks
| Risk | Mitigation |
|---|---|
| Subtle behavior drift (timing of side effects, edge transitions) | Parity harness compares effects, not just states; per-service cutover isolates any drift to one flag flip |
| Legacy state combinations that fit no v1 state | Pre-backfill census query enumerates all live combinations; each gets an explicit mapping before backfill runs |
| Engine becomes a bottleneck/abstraction tax for simple flips | Engine ops are thin single-transaction DB ops; `WorkflowStepLog` doubles as the lifecycle audit we owe anyway |
| Guard/policy divergence | Guards delegate role/capability checks to the policy engine (`08`) — single brain by construction |

## Dependencies
Wave 0 (events, regression suite), Wave 3 (decision/vote guard inputs — can develop in parallel, cutover after W3 DoD). Wave 2's D1 FKs make instance↔project joins clean.

## Definition of done
- [ ] Parity harness: identical outcomes legacy vs. engine across the full regression suite.
- [ ] 100% of projects have instances; derivation verification green; census of unmapped combinations empty.
- [ ] All lifecycle status writes go through `execute()` (lint-verified); dual-write keeping legacy enums correct (nightly parity job).
- [ ] `availableTransitions` drives the admin UI's action buttons on project/study pages.
- [ ] `WorkflowStepLog` complete for one full new project lifecycle (spot-audited against audit log).
- [ ] v2 / emergency / verification / allocation definitions authored, reviewed, inactive.
