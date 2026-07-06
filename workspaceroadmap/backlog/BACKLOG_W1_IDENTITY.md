# Backlog — Wave 1: Identity & Multi-Tenancy
Source: [`../12_WAVE_1_IDENTITY_MULTI_TENANCY.md`](../12_WAVE_1_IDENTITY_MULTI_TENANCY.md) · Zero user-visible change this wave.

---

## Epic W1-E1 — Tenancy schema

**S1 · M · db — `Organization` + `OrganizationMembership` tables**
Do: Migration per `../03` §1: type enum (`ngo|municipality|youth_team|initiative|board`), status, `capabilities` JSON, verification metadata, `contentBlockId`; membership with status/joinedAt; soft-delete columns; no cascades.
AC: Migration applies; models exported from `packages/database`.
Deps: —

**S2 · S · db — `RoleAssignment` table**
Do: Migration: `userId, role, scopeType(platform|organization|fund|project), scopeId?, grantedBy, grantedAt`; unique on `(userId, role, scopeType, scopeId)`; indexes for scope-chain lookups.
AC: Migration applies; lookup by `(scopeType, scopeId)` and by `userId` both indexed.
Deps: —

**S3 · S · db — `Project.ownerOrganizationId` (nullable)**
Do: Additive nullable FK to `organizations`.
AC: Applies; existing writes unaffected.
Deps: S1

---

## Epic W1-E2 — `organizations` module

**S1 · M · api — Org CRUD + membership management (platform-internal)**
Do: New module: create/update orgs (platform-only this wave), add/remove members, all mutations audited via events (`organization.created`, `membership.added`, `capability.changed`…). Non-`ngo|board` types blocked behind org-type flags.
AC: E2E spec covering CRUD + membership + audit trail; flags respected.
Deps: E1-S1, W0 done

**S2 · S · api — Capability administration**
Do: Endpoint to set org capabilities (platform scope only); each change audited with before/after.
AC: Capability change appears in audit viewer with snapshots.
Deps: S1

---

## Epic W1-E3 — Backfill: default org, Board, memberships, grants

**S1 · M · migration — Default org + Board org + project ownership**
Do: Idempotent script: create "HelpingHands" org (`ngo`, full capabilities) and Board org (`board`); backfill `ownerOrganizationId` on all projects; verification query (0 orphan projects); then NOT NULL migration.
AC: 100% projects owned; NOT NULL applied; script re-runnable without duplicates.
Deps: E1, E2-S1

**S2 · M · migration — Membership & grant backfill**
Do: Per wave doc mapping: admins → default-org members (+`administrator` → Board member); grants: `administrator`→`board_chair`(platform)+`org_admin`(org); `employee`→`staff`; `financial_officer`→`org_accountant`; participants → none. Verification: every active admin user ≥1 grant, role-parity with enum.
AC: Verification query clean; backfill audited; seeded accounts unaffected at login.
Deps: S1, E1-S2

**S3 · S · infra — Nightly enum↔grant parity job**
Do: Scheduled job comparing `AdminRole` against `RoleAssignment` mapping; alert on drift. Runs until Wave 8.
AC: Job green post-backfill; alerting verified with an injected drift.
Deps: S2

---

## Epic W1-E4 — Policy engine (shadow mode)

**S1 · L · api — `policy` module: role catalogs + `can()`**
Do: Role catalogs per scope (`../08` table); `can(actor, action, resource)` resolving grants along project→org→platform scope chain + resource/actor attribute conditions via named handlers; decision includes reason.
AC: Unit-test matrix covering every catalog role × representative actions incl. deny reasons; capability-condition handler tested.
Deps: E1-S2

**S2 · M · api — `PolicyGuard` + `@Can()` decorator (shadow)**
Do: Guard resolving action + resource scope from route metadata/params; in shadow mode runs beside `RolesGuard`, logs `{route, actor, legacyResult, policyResult}` on divergence, never blocks.
AC: Every existing authed route annotated with an action mapping (mapping table reviewed); shadow logs flowing in staging.
Deps: S1

**S3 · M · api,infra — Divergence burn-down**
Do: Divergence report (grouped by route); fix mapping/policy gaps until zero across a full regression run, then 2 production weeks.
AC: Zero divergence over both windows; report archived as evidence.
Deps: S2, E3-S2

**S4 · S · api — Sensitive-action decision audit**
Do: Log allow **and** deny decisions for financial/governance action classes to the audit trail.
AC: Denied attempt visible in audit viewer with reason.
Deps: S1

---

## Epic W1-E5 — Auth & session context

**S1 · M · api — `activeOrgId` JWT claim + token versioning**
Do: Add claim (defaulted to sole membership); bump token version with graceful re-login via existing refresh flow; extend `ActorContext` with `activeOrgId` + grants snapshot.
AC: All seeded accounts log in and operate identically; stale tokens re-auth gracefully (spec).
Deps: E3-S2

**S2 · S · api — Tenancy-aware base repository (dark)**
Do: Base repository injecting org filter from `ActorContext` for org-owned aggregates; built and unit-tested, **not enforced** (Wave 2 flips it).
AC: Unit tests prove filtering; no production route uses it yet.
Deps: S1

---

## Epic W1-E6 — Legacy role write-path

**S1 · M · api — `admins` module dual-write**
Do: Role-management endpoints write `RoleAssignment` as source of truth and sync `AdminRole` enum (new→old); lint/service check blocks direct enum writes elsewhere.
AC: Role change via admin UI produces grant + synced enum + audit entry; parity job stays green.
Deps: E3-S2, E4-S1

**S2 · S · qa,docs — Wave close**
Do: Regression suite green flags-OFF; wave-doc DoD walk; `PROGRESS.md` update (W1 ✅, D5 → "begun").
AC: DoD checked with evidence.
Deps: all
