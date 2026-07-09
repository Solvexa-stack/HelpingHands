# 05 — Organizations & Multi-Tenancy

## Purpose
Define how the single-tenant system becomes a multi-workspace platform where NGOs, municipalities, youth teams, initiatives, and the Board are all first-class `Organization` entities — with strict data scoping and zero special-case code per type.

## Problems this document solves
- Today there is no `Organization` entity; everything implicitly belongs to one operator.
- Municipalities must be official government actors without becoming a hardcoded subsystem.
- The Board needs cross-tenant visibility without punching ad-hoc holes in scoping.

## Tenancy model decision
**Shared database, shared schema, row-level organization scoping.**
Rejected: schema-per-tenant / DB-per-tenant — they make the Board's cross-org review, joint projects, and fund→project flows (all core requirements) structurally painful. One region, one platform, strong central governance ⇒ rows, not schemas. Optional hardening with Postgres RLS in Wave 8.

## Key components

### Organization types & capabilities
```
type: ngo | municipality | youth_team | initiative | board
capabilities: { canExecuteProjects, canReceivePublicFunds, canOpenDonations,
                isGovernmentEntity, requiresBoardOversight }
```
Rules:
- Domain code **never** branches on `type`. Behavioral differences are (a) capability checks in the policy engine, (b) workflow guards, (c) which workflow definition a project starts on.
- Type determines the *default* capability set at onboarding (e.g. municipality ⇒ `canExecuteProjects + canReceivePublicFunds + isGovernmentEntity`); the Board can adjust per organization. Capability changes are audited.

### Membership & context
- `OrganizationMembership` links users to orgs (multi-membership allowed: an engineer can belong to a municipality and volunteer in an NGO).
- Roles come from `RoleAssignment(scope=organization)` — see `08`.
- **Active-context pattern:** the JWT session carries `activeOrgId`, switchable in the admin app header. Every request's `ActorContext` includes it; repositories filter by it.

### Data scoping enforcement (three layers)
1. **Repository layer (mandatory):** org-owned queries go through a tenancy-aware base repository that injects the org filter from `ActorContext`. Direct unscoped Prisma access to org-owned tables fails CI lint.
2. **Policy layer:** `can(actor, action, resource)` re-checks resource ownership — defense against layer-1 mistakes.
3. **DB layer (Wave 8, optional):** Postgres RLS policies as backstop.
Board cross-org read is an explicit, policy-granted, audited bypass — not an unscoped query.

#### Implemented state (W2 isolation, 2026-07-08)
Isolation is live: `TENANCY_ENFORCED=true` and `POLICY_ENFORCED=true` are the defaults (`.env.example`); `false` remains the one-flag rollback (09 rule).

**Tenant-scoped entities** (all resolve ownership through `projects.ownerOrganizationId`):
- projects (list/detail/update/delete) and the whole subtree: steps, phases, tasks, milestones, budgets, expenses, transactions
- donations (QR/cash) and online donations incl. QR-token lookups
- studies, study sections, section files, votes (admin views)
- reports (all per-project PDF/Excel), dashboard aggregations (stats, recents, monthly)
- participants: an org workspace only sees people who donated to its own projects

**How it is enforced** — every service routes through `TenancyRepository` (`apps/api/src/modules/policy/tenancy.repository.ts`):
- `enforcedOrgId(subject)` resolves the org to enforce (null for public/anon actors, flag-off, or the audited Board bypass — bypass emits `tenancy.bypassed`).
- `enforcedProjectWhere` / `enforcedProjectRelationWhere` merge the owner-org filter into list queries.
- `assertProjectVisible(projectId)` guards id-addressed reads AND writes; cross-org ids read as **404** (no existence leak). Project-subtree routes are additionally denied earlier by the policy scope-chain (**403**).
- Creation ownership comes from `ActorContext.activeOrgId` — never the request body (no `organizationId` field exists on any create DTO) and no longer the platform default org.

**How to test locally**: `pnpm --filter @helping-hands/api test:e2e -- w2-tenancy-isolation` (two-org A/B wall: lists, id probes, writes, dashboard, reports, platform-admin global view). The broader `w2-tenancy-leak` and `w2-pilot` specs stay in the permanent suite.

### Onboarding & verification
Organization registration runs on the workflow engine (`org-verification` definition, Wave 6): `submitted → under_review → verified → active` with Board approval guard, or `rejected`. Municipalities additionally attach official registration documents (existing `File` model).

### Workspace UX (apps/admin)
- Login → context picker (organizations + funds the user belongs to, plus Board workspace if applicable).
- Sidebar, data, and actions scoped to the active context. The current admin app becomes the first workspace (default org) in Wave 1 with no visible change; multi-org UI lands Wave 2.

## What changes in the existing system
- `Project.ownerOrganizationId` added; backfilled to the default organization (Wave 1).
- `apps/web` project pages later show the owning organization (Wave 2+); no URL breakage.
- Existing `Admin` users become members of the default organization with mapped roles; `Participant`s remain plain users (donors) without org membership.

## Municipalities in one paragraph
A municipality is `Organization(type=municipality)` with government capabilities, verified through the standard onboarding workflow, executing projects via `ProjectParticipation(role=executing_agency)`, funded via `FundingAgreement` + `FundAllocation`, reporting via `ProgressReport`/`FinancialReport`. Every one of those nouns is shared with NGOs and teams. There is no municipality module. (Details: `17_WAVE_6_MUNICIPAL_INTEGRATION.md`.)

## Connections
- Entities: `03_DATA_MODEL.md` §1. Roles/policies: `08`. Verification workflow: `04`.
- Execution: `12_WAVE_1_IDENTITY_MULTI_TENANCY.md`, `13_WAVE_2_ORGANIZATIONS.md`.
