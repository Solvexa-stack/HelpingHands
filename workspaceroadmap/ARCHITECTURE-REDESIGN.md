# HelpingHands → Civic Governance & Development Platform
## System Architecture Redesign — As-Suwayda Regional Platform

**Status:** Proposal — no code changes
**Scope:** Analysis of the current system and target architecture for a multi-entity governance, funding, and civic development platform (NGOs, municipalities, youth teams, funds, and a central Governance Board).

---

## 1. Current System Analysis

### 1.1 What exists today (verified against the codebase)

The platform is a **pnpm monorepo**: a NestJS REST API (`apps/api`), a public Next.js site (`apps/web`), an admin dashboard (`apps/admin`), and a shared Prisma/PostgreSQL package (`packages/database`).

**The implemented project lifecycle** (this is the workflow engine we must preserve):

```
Project created (admin)
  → ProjectStudy created (sections generated from StudyDepartmentTemplate per ProjectType)
  → Sections assigned to employees, completed, reviewed
  → Study published → voting opens (StudyVote: for/against/abstain, one vote per user)
  → Voting closes → approved / rejected (StudyStatus state machine)
  → Donations open:
      • Physical: ProjectDonation with QR token → employee scans → approves
      • Online:  OnlineDonation via Stripe/PayPal (webhooks logged in WebhookLog)
  → Execution: ProjectPhase → ProjectTask (+ ProjectStep hierarchy), ProjectMilestone
  → Financials: ProjectBudget → ProjectExpense, ProjectTransaction (per-project ledger)
  → Progress auto-recalculated; project closure (isCompleted)
```

**Identity model:** a polymorphic `User` points to either an `Admin` or a `Participant` (`referenceType`). Admin roles are a single global enum: `administrator | employee | financial_officer`. Authorization is a global `JwtAuthGuard` + `RolesGuard` with `@Roles(...)` / `@Public()` decorators.

**Content model:** a generic `Block` entity carries all translatable content (`BlockTranslation` per language), and — importantly — the execution and financial tables (`ProjectStep`, `ProjectPhase`, `ProjectTask`, `ProjectBudget`, `ProjectExpense`, `ProjectTransaction`, `ProjectMilestone`) all foreign-key to **Block**, not to `Project`. `Project` itself is a 1:1 satellite of a Block.

### 1.2 Strengths worth preserving

1. **A real, working lifecycle state machine.** `StudyStatus` (`draft → in_review → published → voting_open → voting_closed → approved/rejected`) is a genuine workflow with guards (voting windows, approval actors). It is the seed of the future workflow engine.
2. **Study templates by project type** (`StudyDepartmentTemplate`) — a proto-"workflow definition": the shape of a study is data, not code. This pattern generalizes well.
3. **Separation of pledge and payment.** Physical QR-verified donations vs. online payment-provider donations are separate models with separate verification paths — a good foundation for multi-channel fund income.
4. **Polymorphic User.** Adding new principal types (organization members, fund officers) does not require touching the auth core.
5. **i18n as a first-class concern** (ar/en/fr across templates, sections, content) — essential for a regional civic platform.
6. **Financial primitives already exist per project** (budget → expense → transaction), so the team has already internalized "money must be tracked," even if the model is not yet a real ledger.

### 1.3 What is missing for the new vision

| Vision requirement | Current state |
|---|---|
| Multi-entity workspaces (NGOs, municipalities, teams) | **No `Organization` entity at all.** Everything belongs to one implicit organization. |
| Municipalities as first-class entities | Nothing. |
| Governance Board with cross-entity authority | Closest analog is `administrator` role — but it's a global superuser, not a governance body with decisions, quorums, and a review queue. |
| Dynamic funds with internal governance | **No fund concept.** Money attaches directly to projects; there is no pooled treasury, no fund→project allocation. |
| RBAC/ABAC | A 3-value global enum. No scoped roles, no per-fund or per-project permissions, no attribute policies. |
| Audit trail / no hard deletion | **No audit log model.** Most relations use `onDelete: Cascade` — deleting a Block destroys the project and its donations. No soft-delete convention. |
| Financial traceability | `ProjectTransaction` is a per-project journal with free-form `referenceType`. No double-entry, no account balances, no fund-level view. |
| Project categories for civic work | `ProjectCategory` = `agricultural | industrial | trading` — mismatched with the civic vision (infrastructure, healthcare, social support, relief…). Note `ProjectType` (used by study templates) already has `infrastructure | energy | housing`, so two overlapping enums exist. |
| Voting beyond studies | `StudyVote` is hard-wired to `ProjectStudy`. The Board needs voting on other subjects (fund allocations, policies). |

### 1.4 Structural debts that will fight the expansion

These are not cosmetic — each one directly blocks a vision requirement:

- **D1 — Block-centric foreign keys.** Execution/financial tables reference `Block.id` under a column named `project_id`. Any move toward project-scoped permissions, fund allocations, or reporting joins through content infrastructure. The domain model is welded to the CMS.
- **D2 — Admin-only staff model.** `StudySection.assignedTo`, `ProjectTask.assignedTo`, `ProjectStudy.createdBy` all FK to `Admin`. Municipality engineers and NGO staff can never be assignees without becoming platform "admins."
- **D3 — Enum-encoded state machines.** `StudyStatus`, `DonationStatus`, `PhaseStatus` etc. are Prisma enums with transitions in service code. Adding a Board review step or a municipality co-approval means a migration + code changes in every consumer.
- **D4 — Cascade deletion everywhere.** Directly contradicts the immutability/audit requirement.
- **D5 — Global role enum.** `AdminRole` has no scope dimension; "financial officer" of *what*? Today the answer is "of everything."

None of these require a rewrite. All of them can be corrected incrementally (§7).

---

## 2. Gap Analysis (by capability)

### 2.1 Multi-entity / multi-tenancy
- Missing abstractions: `Organization`, `OrganizationMembership`, org-scoped roles, org-scoped data visibility.
- Tenancy model needed: **shared database, shared schema, row-level org scoping** (single region, one Board with cross-tenant read — schema-per-tenant or DB-per-tenant would make Board oversight and joint projects painful). Enforce scoping in a mandatory query layer, optionally hardened with Postgres Row-Level Security.

### 2.2 Municipal integration
- A municipality is an `Organization` with `type = municipality` plus **capabilities** (attributes), not special-case code. What actually differs is *what it may do* — receive public funds, act as executing agency, submit official reports — and those are capability flags + ABAC policies, not subclasses.
- Missing: joint-project participation (many-to-many org↔project with roles), progress/financial reporting artifacts, funding-agreement linkage to funds.

### 2.3 Fund management
- Missing entirely: `Fund`, fund membership/officers, fund treasury (accounts, double-entry transactions), `FundAllocation` (fund → project financing), donation routing to funds (today donations only route to projects).
- The existing donation flows become **income channels** into either a project or a fund.

### 2.4 Governance layer
- Missing: `Board` as a governance body (it can itself be an `Organization` of type `board` — one mechanism for all entity types), `BoardDecision` records (approve/reject/request-changes with rationale, immutable), generalized `Vote` on any decidable subject, review queues across all organizations.

### 2.5 Workflow engine
- Current: one hardcoded state machine per enum. Needed: table-driven workflow definitions (states, transitions, guards, required actors) so the *existing* lifecycle becomes "Workflow Definition v1" and new flows (municipal infrastructure flow with Board co-approval, emergency relief fast-track) are data, not migrations.

### 2.6 Transparency & audit
- Missing: append-only `AuditLog`, soft-delete convention, actor attribution on every mutation, public transparency views (read-only aggregates over funds/projects/orgs).

---

## 3. High-Level Architecture

### 3.1 Shape: modular monolith, evolved in place

**Recommendation: keep the NestJS modular monolith.** Do not split into microservices. The workload (regional platform, strong cross-module transactional needs: donation → ledger → project progress → audit in one transaction) is exactly where a well-modularized monolith wins. Design module boundaries as if they were services (no reaching into another module's tables), so extraction later stays possible.

### 3.2 Bounded contexts / core modules

```
┌────────────────────────────────────────────────────────────────────┐
│                         API (NestJS)                               │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Identity &   │  │ Organizations │  │ Governance               │  │
│  │ Access       │  │ (tenancy)     │  │ (Board, decisions,       │  │
│  │ AuthN, RBAC/ │  │ NGOs, munis,  │  │  generalized voting)     │  │
│  │ ABAC engine  │  │ teams, board  │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                       │                │
│  ┌──────┴─────────────────┴───────────────────────┴─────────────┐  │
│  │ Workflow Engine (definitions, instances, transitions, guards)│  │
│  └──────┬─────────────────┬───────────────────────┬─────────────┘  │
│         │                 │                       │                │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌────────────┴─────────────┐  │
│  │ Projects     │  │ Funds &      │  │ Reporting & Transparency │  │
│  │ lifecycle,   │  │ Treasury     │  │ (dashboards, public      │  │
│  │ studies,     │  │ ledger,      │  │  views, analytics)       │  │
│  │ execution    │  │ allocations, │  │                          │  │
│  │              │  │ donations    │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                    │
│  Cross-cutting: Audit Log (append-only) · Notifications ·          │
│                 Content/i18n (Blocks) · Files                      │
└────────────────────────────────────────────────────────────────────┘
```

Module interaction rules:
- **Domain events** connect modules: `donation.approved`, `study.approved`, `board.decision.recorded`, `allocation.disbursed`. The audit log, notifications, and progress recalculation are event subscribers, never inline calls from unrelated modules.
- **Funds & Treasury owns money.** Projects never mutate balances; they request allocations/disbursements through the treasury API. This is what makes "full financial traceability" enforceable.
- **Workflow Engine owns state.** Modules ask it "can actor X transition instance Y via T?" and "what transitions are available?" — they don't flip status columns themselves.
- **Content (Blocks) becomes presentation-only** (D1 fix): domain tables FK to domain tables; a project *has* a content block, it is not *rooted in* one.

### 3.3 Frontends

- `apps/web` — public transparency portal + participant/donor experience (per-org public pages, fund dashboards, project progress).
- `apps/admin` — becomes the **workspace application**: after login, users pick an organization/fund context; navigation and data are scoped to it. Board members get an additional cross-org governance workspace. One app, context-switched — not one app per entity type.

---

## 4. Conceptual Data Model

### 4.1 Organizations & identity

```
OrganizationType: ngo | municipality | youth_team | initiative | board | fund_authority(optional)

Organization
  id, type, name(+i18n), status (pending_verification|active|suspended|archived)
  capabilities: JSON attribute set, e.g.
    { canExecuteProjects, canReceivePublicFunds, isGovernmentEntity,
      canOpenDonations, requiresBoardOversight }
  verification metadata (registration no., official docs)
  contentBlockId → Block (public profile page)   [soft-deletable: deletedAt]

OrganizationMembership
  userId → User, organizationId → Organization
  role (org-scoped role, see §6), status, joinedAt
  (a user may belong to several organizations)
```

**Municipality = `Organization(type=municipality, capabilities={canExecuteProjects:true, canReceivePublicFunds:true, isGovernmentEntity:true})`.** No municipality table, no `if (type === 'municipality')` in domain logic — behavior differences are expressed through capabilities checked by the policy engine, and through workflow definitions that reference capabilities in guards ("executing org must have canExecuteProjects").

**The Board = `Organization(type=board)`** whose memberships carry platform-scope governance roles. Board authority comes from the permission system (§6), not from bypass flags.

`User` stays polymorphic; `Admin`/`Participant` remain during migration. `Admin` eventually dissolves into "platform-staff memberships in the Board/platform organization" (D2 fix: assignees become `User` references, not `Admin` references).

### 4.2 Projects (extended, not replaced)

```
Project
  + ownerOrganizationId → Organization        (required after backfill)
  + workflowInstanceId → WorkflowInstance     (replaces studyStatus over time)
  + category → ProjectCategory (extended taxonomy, see below)
  existing: study, phases, tasks, milestones, budget… unchanged

ProjectParticipation                          (joint / cross-org projects)
  projectId, organizationId
  role: owner | executing_agency | funding_partner | supervising | beneficiary_rep
  scope notes, status
  → a municipality executing an NGO-initiated project = one row here.

ProjectCategory (data table, not enum — categories will grow)
  infrastructure(roads/water/electricity/utilities), education, healthcare,
  reconstruction, social_support(martyr families, widows, orphans, displaced,
  refugees/IDPs), emergency_relief, salaries_and_aid, agricultural, industrial,
  trading (existing values kept for backward compatibility)
  hierarchical (parentId) to support sub-categories like social_support/orphans.
```

Merge the `ProjectCategory`/`ProjectType` enum duplication into this one table; study templates key off it.

### 4.3 Funds & treasury

```
Fund
  id, name(+i18n), purpose, status (active|frozen|closed)
  managingOrganizationId → Organization (optional: Board-managed or org-managed)
  policy: JSON (allocation rules, spending limits, dual-approval thresholds)

FundMembership
  fundId, userId
  role: director | deputy | secretary | accountant | controller_auditor
  (fund-scoped roles, distinct from org roles)

── Treasury (double-entry core) ──
Account
  id, ownerType/ownerId (fund | project | provider_clearing | external)
  currency, type (asset|liability|income|expense), balance is DERIVED

LedgerTransaction                              (immutable, append-only)
  id, timestamp, actorUserId, description, referenceType/referenceId
  status (pending|posted|reversed) — corrections are reversing entries, never edits

LedgerEntry
  transactionId, accountId, direction (debit|credit), amount, currency
  invariant: entries per transaction balance to zero

FundAllocation                                 (fund → project financing)
  fundId, projectId, amount, status:
    proposed → board_approved → disbursed(tranches) → reconciled → closed
  approvedByDecisionId → BoardDecision
  disbursements are LedgerTransactions (fund account → project account)

FundingAgreement                               (fund → organization, esp. municipalities)
  fundId, organizationId, terms, reporting schedule, status
  the contract under which allocations & progress reports flow
```

**Donations re-route through the treasury:** existing `ProjectDonation` (QR/physical) and `OnlineDonation` (Stripe/PayPal) are kept as-is as *intake channels*; on approval/webhook-completion they post a `LedgerTransaction` crediting the target project's (or fund's) account. `ProjectTransaction` is superseded by ledger entries scoped to the project's account (kept read-only during migration).

**Multi-fund financing of one project** = multiple `FundAllocation` rows; the project account's credits show exactly which fund financed what.

### 4.4 Governance

```
BoardDecision                                  (immutable record)
  id, subjectType/subjectId (project | study | fund_allocation | organization | policy)
  decision: approved | rejected | changes_requested
  rationale, decidedAt, sessionRef
  linkage: voteRoundId (if decided by vote)

VoteRound                                      (generalizes StudyVote)
  id, subjectType/subjectId, opensAt, closesAt
  eligibility policy (who may vote: board members / org members / public tier)
  quorum & threshold rules (JSON)
Vote
  voteRoundId, userId, choice (for|against|abstain), comment
  unique (voteRoundId, userId)

ProgressReport / FinancialReport               (org → board/fund reporting)
  organizationId, projectId?, fundingAgreementId?, period, payload, attachments
  status: submitted → under_review → accepted | returned
```

Existing `StudyVote` is migrated into `VoteRound(subject=ProjectStudy)` + `Vote` rows; the study workflow's "voting_open/closed" states then reference vote rounds generically.

### 4.5 Audit & immutability (cross-cutting)

```
AuditLog (append-only; no update/delete grants — enforced at DB role level)
  id, timestamp, actorUserId, actorOrgId, action (verb.noun),
  subjectType/subjectId, before/after snapshot (JSON), requestId, ip

Conventions applied across all domain tables:
  • deletedAt / deletedBy columns; "delete" endpoints only soft-delete
  • remove onDelete: Cascade from domain relations (restrict instead)
  • every mutating service method receives an ActorContext and emits an audit event
```

### 4.6 Relationship overview

```
Organization ──< OrganizationMembership >── User
Organization ──< Project (owner)
Organization ──< ProjectParticipation >── Project     (joint projects)
Organization ──< FundingAgreement >── Fund
Fund ──< FundMembership >── User
Fund ──< FundAllocation >── Project ── approved by ── BoardDecision
Fund/Project ── Account ──< LedgerEntry >── LedgerTransaction
Project ── WorkflowInstance ── WorkflowDefinition
Anything decidable ── VoteRound ──< Vote;  BoardDecision references VoteRound
Everything mutable ──> AuditLog (append-only)
```

---

## 5. Workflow Engine Design

### 5.1 Model: table-driven state machine

```
WorkflowDefinition   id, key (e.g. "project-lifecycle"), version, subjectType, isActive
WorkflowState        definitionId, key, kind (initial|normal|terminal), metadata
WorkflowTransition   definitionId, fromState, toState, action key
                     guards: JSON list, e.g.
                       [{type:"role", scope:"board", role:"member"},
                        {type:"vote_passed", round:"study-vote"},
                        {type:"capability", org:"executor", cap:"canExecuteProjects"},
                        {type:"all_sections_complete"}]
                     effects: domain events to emit (e.g. "donations.open")
WorkflowInstance     definitionId+version, subjectType/subjectId, currentState
WorkflowStepLog      instanceId, transition, actor, timestamp, note   (append-only)
```

The engine exposes exactly three operations: `start(subject, definitionKey)`, `availableTransitions(instance, actor)`, `execute(instance, action, actor, payload)`. Guards are evaluated by registered guard handlers (code), but *which guards apply where* is data.

### 5.2 Preserving the existing lifecycle

The current flow is transcribed 1:1 as **`project-lifecycle` v1**:

```
draft → in_review → published → voting_open → voting_closed
      → approved → donations_open → executing → completed
      → (rejected at review/vote stages)
```

with guards matching today's service logic (creator role, voting window, admin approval). During migration the enum columns (`studyStatus` etc.) are kept in sync by the engine's effects (dual-write) until all readers use `WorkflowInstance.currentState`; then the enums become derived/deprecated. **Behavior does not change for existing projects** — v1 encodes exactly what the code does now.

### 5.3 Extending without breaking

- New flows = new definitions or new *versions*: e.g. `project-lifecycle` v2 inserts `board_review` between `voting_closed` and `approved`, and adds an `executing_org_assigned` guard; `emergency-relief` v1 skips voting entirely (Board fast-track). Running instances stay on their pinned version; new projects start on the org-type-appropriate definition.
- Voting integrates as a guard + effect pair: entering `voting_open` *creates* a `VoteRound` (effect); leaving it *requires* `vote_passed` or records failure (guard). Board approval integrates the same way via `board_decision_recorded` guards. The engine doesn't know what a vote is — it knows a guard handler said yes.

---

## 6. Permission System (RBAC + ABAC hybrid)

### 6.1 Structure: scoped roles + policy checks

Every grant is a triple **(user, role, scope)** — never a global role:

```
RoleAssignment: userId, role, scopeType (platform|organization|fund|project), scopeId
```

**Role catalogs per scope:**

| Scope | Roles (examples) | Notes |
|---|---|---|
| Platform (Board) | `board_chair`, `board_member`, `board_secretary`, `platform_auditor` | Cross-org **read** everywhere + governance verbs (decide, open votes, freeze). Not raw write access into org data. |
| Organization | `org_admin`, `project_manager`, `staff`, `org_accountant`, `viewer` | Same catalog for NGOs, municipalities, teams — capabilities differentiate what the *org* may do, roles differentiate what the *member* may do. |
| Fund | `fund_director`, `fund_deputy`, `fund_secretary`, `fund_accountant`, `fund_controller` | Controller/auditor: read-everything + flag, **no** initiate/approve (segregation of duties). |
| Project | `project_lead`, `contributor`, `financial_delegate` | Optional fine-grain on top of org roles, needed for joint projects (a municipality engineer gets `contributor` on one NGO project without joining the NGO). |

**ABAC layer** — a central policy service answers `can(actor, action, resource)` by combining:
1. Role grants in the resource's scope chain (project → owning org → platform),
2. Resource attributes (project state, fund policy thresholds, org capabilities),
3. Actor attributes (org membership type, capability of actor's org).

Example policies (data, not code):
- `fund.allocation.approve` requires `fund_director` **and** amount ≤ fund policy threshold, else additionally `board_decision`.
- `project.report.submit` requires org role ≥ `project_manager` **and** org has participation role `executing_agency` on that project.
- `treasury.entry.*` is never granted to any human role — only the treasury module posts entries (financial writes go through domain actions, and controllers get read + annotate).

### 6.2 Enforcement points

- API layer: existing `JwtAuthGuard` stays; `RolesGuard` is replaced by a `PolicyGuard` (`@Can('project.approve')`) resolving scope from the route.
- Query layer: mandatory org-scoping in repositories (tenant filter injected from actor context); Board read-all is an explicit policy-granted bypass, logged.
- Workflow guards and the policy service share the same evaluator, so "who can transition" and "who can call the endpoint" can never disagree.
- Every allow/deny on sensitive actions (financial, governance) is itself audit-logged.

---

## 7. Implementation Roadmap

Sequenced so every phase ships value, nothing breaks the running system, and each phase's model work is a prerequisite for the next. All schema changes are **additive**; destructive cleanups happen only in the final phase.

**Phase 0 — Foundations (audit, safety)**
- Add `AuditLog` (append-only) + audit event emission from existing mutating services.
- Add `deletedAt/deletedBy` everywhere; convert delete endpoints to soft-delete; replace `onDelete: Cascade` with `Restrict` on domain relations.
- Introduce the `ActorContext` pattern and domain-event bus (in-process).
- *No user-visible change; de-risks everything after.*

**Phase 1 — Organizations & scoped identity**
- Add `Organization`, `OrganizationMembership`, `RoleAssignment`; build the policy service alongside `RolesGuard` (shadow mode first: log decisions, compare, then flip).
- **Backfill:** create one default organization ("HelpingHands"); attach all existing projects (`ownerOrganizationId`), map `Admin` roles to org/platform role assignments, map `Participant`s to plain users. `Admin`/`AdminRole` stay but become derived — new code reads assignments.
- Fix D1/D2 with additive FK columns (`ProjectStep.realProjectId` → `Project`, assignee → `User`), backfilled from existing data; readers migrate table-by-table.
- Admin app gains workspace/context switching (single org at first — invisible change).

**Phase 2 — Governance Board & generalized voting**
- Create Board organization + roles; add `VoteRound`/`Vote`, migrate `StudyVote` data; add `BoardDecision`.
- Board workspace in admin app: cross-org review queue, decision recording.
- Existing approval step now *records* a BoardDecision (dual-write with `approvedById`).

**Phase 3 — Workflow engine**
- Add definition/instance tables; transcribe current lifecycle as `project-lifecycle` v1; start instances for all existing projects at their current state (derivable from `studyStatus` + flags).
- Engine dual-writes legacy enum columns until all readers are migrated.
- Ship v2 definitions (board review step, municipal variants) only after parity is verified.

**Phase 4 — Funds & treasury**
- Add `Fund`, `FundMembership`, `Account`, `LedgerTransaction/Entry`, `FundAllocation`, `FundingAgreement`.
- Create a project account per existing project; **backfill ledger from `ProjectTransaction` history** (opening-balance transaction + historical entries where reconstructible); freeze `ProjectTransaction` as read-only legacy.
- Route donation approval/webhook completion through treasury posting.
- Fund dashboards; allocation workflow (`fund-allocation` definition) wired to Board decisions.

**Phase 5 — Municipalities & multi-entity onboarding**
- Enable `municipality`/`youth_team` organization types + verification workflow (itself a workflow definition).
- `ProjectParticipation` for joint projects; `ProgressReport`/`FinancialReport` + reporting schedules from funding agreements.
- Extend `ProjectCategory` taxonomy (data table) with civic categories; study templates per new categories.
- Public transparency portal: per-org pages, fund flows, project progress (read-only aggregates).

**Phase 6 — Consolidation**
- Remove dual-writes; deprecate `AdminRole` enum, legacy status enums, `ProjectTransaction`; drop Block-rooted FKs after all readers use domain FKs.
- Optional hardening: Postgres RLS for tenant isolation, read replicas for public/analytics traffic.

**Migration safety rules (all phases):** additive migrations only until Phase 6; every backfill is a reversible script run against a staging copy first; dual-write + shadow-read before any read-path switch; feature flags per organization type so municipalities can be piloted with one real municipality before general rollout.

---

## Final note

The current system is not a prototype to discard — it is a working single-tenant instance of exactly the platform the vision describes. The redesign is therefore a **generalization**: wrap the existing lifecycle in a workflow engine, wrap the existing users in scoped memberships, wrap the existing donations in a real treasury, and put an immutable audit spine under all of it. Municipalities, funds, and the Board then become *data* (organization types, fund records, role assignments) rather than new code paths — which is the property that makes a national-scale platform maintainable.
