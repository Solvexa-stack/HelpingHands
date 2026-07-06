# Backlog — Wave 4: Workflow Engine
Source: [`../15_WAVE_4_WORKFLOW_ENGINE.md`](../15_WAVE_4_WORKFLOW_ENGINE.md) · Parity before features. Do not overlap with Wave 5.

---

## Epic W4-E1 — Engine core

**S1 · M · db — Engine tables**
Do: Migration: `WorkflowDefinition/State/Transition/Instance/StepLog` per `../04`; instances pin `definitionId+version`; StepLog append-only.
AC: Migrations apply; unique constraints on `(definition, version)` and `(subjectType, subjectId)` per instance.
Deps: W0 done

**S2 · L · api — `workflow` module: the three operations**
Do: `start`, `availableTransitions`, `execute` — guard re-check + state move + StepLog write + effect emission in one DB transaction; concurrency-safe (row lock on instance).
AC: Unit tests incl. concurrent `execute` race (one wins, one rejected); invalid transition rejected with reason.
Deps: S1

**S3 · M · api — Guard-handler registry**
Do: Handlers: `role`, `capability` (both delegating to policy engine), `vote_passed`, `board_decision`, `sections_complete`, `window_open`; params from transition rows.
AC: Each handler unit-tested against fixtures (incl. W3 decisions/rounds as inputs).
Deps: S2, W3-E2

**S4 · S · api — Effect emitter**
Do: Effects as domain-event names emitted on successful transition (`vote_round.create`, `donations.open`, …); subscribers registered by owning modules.
AC: Effect fires exactly once per successful transition (rollback test: failed transition emits nothing).
Deps: S2

## Epic W4-E2 — `project-lifecycle` v1 + parity harness

**S1 · M · api,docs — v1 definition seed**
Do: Seed data transcribing today's machine per `../04` (states draft→…→completed, rejected branches; guards matching current service checks). Transcription reviewed against `study`/`voting`/`projects` service code line-by-line.
AC: Definition review sign-off recorded; seed idempotent.
Deps: E1

**S2 · L · qa — Parity harness**
Do: Run the W0 regression suite through both paths — legacy services vs. engine-driven — asserting identical status sequences, emitted events, and endpoint responses.
AC: 100% parity across the full suite; divergences fixed in the definition (or exposed as pre-existing bugs → filed) before any cutover.
Deps: S1, E1

## Epic W4-E3 — Instance backfill

**S1 · S · migration — Legacy state census**
Do: Query enumerating all live combinations of `studyStatus × isCompleted × donation-open`; every combination gets an explicit v1-state mapping in a derivation table; ambiguities resolved with product owner.
AC: Census empty of unmapped combinations; derivation table committed.
Deps: E2-S1

**S2 · M · migration — Backfill instances for all projects**
Do: Idempotent script creating positioned instances per derivation table; verification: every instance's `currentState` maps back to legacy columns exactly; staging rehearsal.
AC: 100% projects have instances; verification clean in production.
Deps: S1

## Epic W4-E4 — Service cutovers (one flag + deploy each, soak between)

**S1 · M · api — Dual-write bridge**
Do: Engine effects sync legacy enum columns (`studyStatus`, voting windows) new→old; nightly enum↔state parity job (until Wave 8).
AC: Untouched readers (web pages, dashboard) correct with engine driving; job green.
Deps: E3-S2

**S2 · M · api — Cutover: `study` service**
Do: draft→review→publish→approve transitions via `execute()`; W3's decision recording becomes the `board_decision` guard input; direct `studyStatus` writes removed; lint rule added for this column.
AC: Regression green; StepLog shows transitions; flag rollback rehearsed.
Deps: S1, E2-S2

**S3 · M · api — Cutover: `voting`**
Do: Entering voting state emits `vote_round.create` effect; closing requires `vote_passed` guard; round lifecycle (W3) unchanged externally.
AC: Regression green; round created by effect, not by service call.
Deps: S2

**S4 · M · api — Cutover: `projects`/`donations` gating + `execution` closure**
Do: Donations-open gating reads engine state; executing→completed transition via engine; `isCompleted` synced by bridge.
AC: Regression green; donation attempted in wrong state rejected by guard.
Deps: S3

## Epic W4-E5 — Admin UI

**S1 · M · admin-ui — Instance timeline + transition actions**
Do: Project/study pages: current state, StepLog timeline, action buttons rendered from `availableTransitions` (replaces hardcoded buttons on migrated flows).
AC: Buttons match actor permissions exactly (spec per role); timeline complete for a fresh lifecycle.
Deps: E4-S2

**S2 · S · admin-ui — Definition viewer (read-only)**
Do: Board/platform screen listing definitions/versions with state-transition graph rendering.
AC: v1 renders correctly; versions listed.
Deps: E2-S1

## Epic W4-E6 — Author future definitions (inactive) & wave close

**S1 · M · api,docs — Author v2, `emergency-relief`, `org-verification`, `fund-allocation`**
Do: Seed as **inactive** data per `../04`/owning wave docs (v2 = board_review step + executing-org guard); review with product owner.
AC: Definitions load and render in viewer; `isActive=false`; activation explicitly deferred to W5/W6.
Deps: E2-S1

**S2 · S · qa,docs — Wave close**
Do: Full-suite parity re-run; DoD walk; `PROGRESS.md` (W4 ✅, D3 → "repaired, dual-write").
AC: DoD checked with evidence; all cutover flags ON in production.
Deps: all
