# 09 — Migration & Backward Compatibility Playbook

## Purpose
The rulebook every wave obeys when touching a production system. Wave docs say *what* migrates; this doc says *how*, so migration mechanics are decided once.

## Problems this document solves
- Prevents any wave from shipping a breaking schema or API change "because it was convenient."
- Standardizes the expand → migrate → contract pattern so reviews check conformance, not invention.
- Defines rollback expectations before anyone needs them.

## The prime directive
**Expand → Migrate → Contract.** Waves 0–7 only expand (add tables/columns/endpoints) and migrate (backfill, dual-write, move readers). Contract (drop/rename/repurpose) happens exclusively in Wave 8, and only for items whose readers are provably gone.

## Standard sequences

### Adding a truth that already exists implicitly (e.g. `ownerOrganizationId`)
1. Add nullable column + backfill script (idempotent, batched, resumable).
2. Run on staging copy; verify counts; run in production.
3. New writes set the column (application-level default); add NOT NULL only after backfill verified.
4. Readers switch when their wave needs it — never forced early.

### Replacing a representation (enum → workflow state, journal → ledger, StudyVote → VoteRound)
1. **Expand:** new tables live alongside old.
2. **Backfill:** derive new rows from old (state derivation, ledger reconstruction, vote migration). Every backfill script has a written derivation rule and a verification query (row counts + spot invariants).
3. **Dual-write:** the *new* owner keeps the legacy representation in sync (engine syncs enum; treasury freezes journal; vote service writes rounds). One direction only — legacy never writes forward.
4. **Shadow-read:** new read path computed and compared against legacy in logs until divergence = 0 over an agreed soak window.
5. **Cutover per reader**, behind a feature flag; legacy representation becomes read-only.
6. **Contract** in Wave 8.

### Replacing an enforcement mechanism (RolesGuard → PolicyGuard)
Shadow mode (log-only comparison) → divergence burn-down → enforcement flip via flag → legacy retained dormant until Wave 8. (Detailed in `08`.)

## API compatibility rules
- Existing REST endpoint contracts (paths, verbs, response shapes consumed by `apps/web`/`apps/admin`) are frozen; new capability = new endpoints or additive response fields only.
- Deprecations are announced in code (`@deprecated` + response header) at least one wave before Wave 8 removal.
- `apps/web` public URLs (project slugs, locales) never break.

## Data safety rules
- Every backfill: dry-run mode, staging rehearsal on a production copy, row-count + invariant verification, and a written reverse script (or explicit "irreversible — snapshot first" flag requiring a DB snapshot immediately before).
- Immutable tables (`AuditLog`, ledger, votes, decisions, step logs) are excluded from any cleanup tooling.
- Soft-delete convention from Wave 0 applies to all new tables from birth.

## Feature flags
- Per-flag owner and removal wave recorded at creation (flags are debt too).
- Org-type gating: `municipality` and `youth_team` types exist in schema from Wave 1 but are enable-flagged until their waves (2, 6) — pilot with one real entity before general availability.

## Rollback expectations
- Schema expansions: forward-safe, no rollback needed.
- Backfills: reverse script or snapshot restore, decided before running.
- Cutovers: every reader flip must be revertible by flag flip alone within the soak window.
- Deployments remain single-unit (modular monolith) — no cross-service version skew to manage.

## Seed & environment continuity
- Seeded accounts (`admin@`, `employee@`, `officer@`, `participant@helpinghands.org/example.com`) must work identically after every wave; the seed script is updated in the same PR as any identity change.
- `packages/database` migration history stays linear; no squashing before Wave 8.

## Definition of "backward compatible" (test contract)
A wave is compatible iff, with all its flags OFF, the full regression suite from Wave 0 passes unmodified; and with flags ON, the same suite passes with only explicitly whitelisted assertion updates.

## Connections
- Regression suite creation: `11_WAVE_0_FOUNDATIONS.md`.
- Per-wave migration steps: each wave doc's "Migration strategy" section cites the sequences above by name.
- The contract phase: `19_WAVE_8_FINAL_CONSOLIDATION.md`.
