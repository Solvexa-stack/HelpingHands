# 12 — Wave 1: Identity & Multi-Tenancy

## Goals
Lay the tenancy substrate: organizations exist, every project has an owner, every permission is a scoped grant, and the policy engine runs in shadow mode. **Zero user-visible change** — the platform still behaves single-tenant, but is no longer structurally single-tenant.

## New tables / modules
- **`Organization`**, **`OrganizationMembership`**, **`RoleAssignment`** (shapes: `03` §1; all org types in the enum from day one, non-`ngo|board` types behind enable flags per `09`).
- **`organizations` module**: CRUD (platform-internal this wave), membership management, capability administration (audited).
- **`policy` module**: `can(actor, action, resource)` engine (`08`), role catalogs, `PolicyGuard` + `@Can()` decorator — running in **shadow mode** beside `RolesGuard`.
- `ActorContext` gains `activeOrgId` (from JWT claim); tenancy-aware base repository created (enforced from Wave 2).

## What changes in the existing system
- **Backfill (the heart of this wave):**
  1. Create the default organization ("HelpingHands", type `ngo`, full capabilities) and the Board organization (type `board`).
  2. `Project.ownerOrganizationId` added and backfilled to the default org.
  3. Memberships: every `Admin`-linked user → member of default org; `administrator` seed also → Board member.
  4. Grants: `administrator` → `board_chair`(platform) + `org_admin`(default org); `employee` → `staff`(default org); `financial_officer` → `org_accountant`(default org). Participants: no grants (donors).
- **Auth:** JWT payload adds `activeOrgId` (defaulted to the only membership); login flow unchanged for all seeded accounts.
- `AdminRole` enum becomes **read-only legacy**: still read by `RolesGuard`, no longer the source of truth; writes to it blocked by lint + service check.
- `admins` module role-management endpoints now write `RoleAssignment` and sync the enum (dual-write, new→old).

## Migration strategy
- "Adding a truth that exists implicitly" sequence (`09`): nullable → backfill → verify → NOT NULL on `ownerOrganizationId`.
- Grant backfill is idempotent and re-runnable; verification query asserts every active admin user has ≥1 grant and role-parity with the enum.
- Policy shadow mode: log `{route, actor, rolesGuardResult, policyResult}` divergences; burn down to zero over the regression suite + 2 production weeks; **enforcement does NOT flip this wave** (that's Wave 2, with tenancy filters live).

## Risks
| Risk | Mitigation |
|---|---|
| Grant backfill mismatch locks someone out later | Shadow mode catches divergence before enforcement; seeded-account logins in regression suite |
| JWT claim change breaks existing sessions | Token version bump + graceful re-login; refresh-token flow already exists |
| Scope creep ("let's build org UI now") | Explicitly out of scope; UI is Wave 2 |
| Dual-write drift on role changes | Nightly parity check job comparing enum vs. grants until Wave 8 |

## Dependencies
Wave 0 (audit — every backfill and grant change must be audited; regression suite as gate).

## Definition of done
- [ ] Default org + Board org exist; 100% of projects have `ownerOrganizationId` (NOT NULL applied).
- [ ] All admin users have memberships + grants; nightly parity check green.
- [ ] Policy engine answers for every existing route; shadow divergence = 0 across full regression run + 2-week production soak.
- [ ] JWT carries `activeOrgId`; all seeded accounts log in and operate exactly as before.
- [ ] Regression suite unmodified and green (flags OFF), per `09`'s compatibility contract.
