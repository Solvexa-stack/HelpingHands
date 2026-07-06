# 03 — Data Model (Conceptual)

## Purpose
The single reference for all new entities and how they attach to the existing schema. Wave docs cite these entities; nobody re-derives shapes mid-implementation. Conceptual level only — exact Prisma definitions are written during the owning wave.

## Problems this document solves
- Multi-entity ownership without special-case tables (municipality = data, not schema).
- Money as an auditable ledger instead of per-project journal rows.
- Decisions, votes, and audit as immutable records.
- A repair path for debts D1/D2 (Block-rooted and Admin-rooted FKs).

## Conventions (all new tables)
- `createdAt/updatedAt`; soft delete via `deletedAt/deletedBy` (Wave 0 convention); **no** `onDelete: Cascade` on domain relations — `Restrict`.
- Immutable tables (`AuditLog`, `LedgerTransaction`, `LedgerEntry`, `BoardDecision`, `Vote`, `WorkflowStepLog`): no update/delete; corrections are new compensating rows.
- Polymorphic references use the existing `referenceType/referenceId` idiom already established by `User`, `File`, `Notification`.

## 1. Organizations & identity (Waves 1–2)

```
Organization
  type: ngo | municipality | youth_team | initiative | board
  name (+ i18n via content block), status: pending_verification | active | suspended | archived
  capabilities JSON: { canExecuteProjects, canReceivePublicFunds, canOpenDonations,
                       isGovernmentEntity, requiresBoardOversight }
  verification metadata (registration no., documents via File)
  contentBlockId → Block (public profile)

OrganizationMembership
  organizationId, userId, status, joinedAt
  (role lives in RoleAssignment, not here — one grant mechanism, not two)

RoleAssignment                       ← replaces the semantics of AdminRole (D5)
  userId, role (string from role catalog, §08)
  scopeType: platform | organization | fund | project
  scopeId (null for platform)
  grantedBy, grantedAt
```

Existing `User` unchanged. `Admin`/`Participant` remain through migration; `AdminRole` becomes derived-only after Wave 1 backfill and is dropped in Wave 8.

## 2. Projects — extensions (Waves 2, 6)

```
Project (existing table, additive columns)
  + ownerOrganizationId → Organization       (backfilled to default org, Wave 1)
  + workflowInstanceId → WorkflowInstance    (Wave 4)
  + categoryId → ProjectCategoryNode         (Wave 6)

ProjectParticipation                          (Wave 6 — joint projects)
  projectId, organizationId
  role: owner | executing_agency | funding_partner | supervising | beneficiary_rep
  status, notes

ProjectCategoryNode                           (Wave 6 — replaces both category enums)
  key, parentId (hierarchy: social_support → orphans, widows, martyr_families, idps…)
  i18n names; existing enum values kept as top-level nodes for compatibility
  target taxonomy: infrastructure, education, healthcare, reconstruction,
  social_support/*, emergency_relief, salaries_and_aid, agricultural, industrial, trading
```

### D1/D2 repair (Wave 2, additive)
- Each of `ProjectStep, ProjectPhase, ProjectTask, ProjectBudget, ProjectExpense, ProjectTransaction, ProjectMilestone` gains a true `projectRefId → projects.id`, backfilled via the existing `Block ←1:1→ Project` link. Legacy Block-FK columns stay until Wave 8.
- Assignee/creator columns gain `*UserId → users.id` twins (`assignedToUserId`, `createdByUserId`), backfilled through `Admin → User`. Legacy Admin-FK columns stay until Wave 8.

## 3. Funds & treasury (Wave 5)

```
Fund
  name (+i18n), purpose, status: active | frozen | closed
  managingOrganizationId → Organization (nullable: Board-managed funds)
  policy JSON: spending limits, dual-approval thresholds, allocation rules

FundMembership
  fundId, userId  (roles via RoleAssignment scope=fund:
  fund_director | fund_deputy | fund_secretary | fund_accountant | fund_controller)

Account
  ownerType/ownerId: fund | project | provider_clearing | external
  currency, kind: asset | liability | income | expense
  (balance is always computed from entries)

LedgerTransaction   (immutable)
  timestamp, actorUserId, description, referenceType/referenceId,
  status: pending | posted | reversed   (reversal = new compensating transaction)

LedgerEntry         (immutable)
  transactionId, accountId, direction: debit | credit, amount, currency
  invariant: per-transaction entries sum to zero

FundAllocation      (fund → project financing; multi-fund = multiple rows)
  fundId, projectId, amount
  status: proposed → board_approved → disbursing → reconciled → closed
  approvedByDecisionId → BoardDecision
  disbursement tranches are LedgerTransactions (fund account → project account)

FundingAgreement    (fund → organization, the municipal channel)
  fundId, organizationId, terms, reportingSchedule, status
```

**Donations become intake channels:** `ProjectDonation` (QR) and `OnlineDonation` (Stripe/PayPal) keep their tables and flows; on approval / webhook completion, Treasury posts the credit to the target account. `ProjectTransaction` is frozen read-only after ledger backfill (Wave 5) and dropped in Wave 8.

## 4. Governance (Wave 3)

```
BoardDecision   (immutable)
  subjectType/subjectId: project | project_study | fund_allocation | organization | policy
  decision: approved | rejected | changes_requested
  rationale, decidedAt, sessionRef, voteRoundId?

VoteRound       (generalizes study voting)
  subjectType/subjectId, opensAt, closesAt
  eligibility policy JSON (board members / org members / configured group)
  quorum & threshold rules JSON

Vote            (immutable)
  voteRoundId, userId, choice: for | against | abstain, comment
  unique (voteRoundId, userId)

ProgressReport / FinancialReport    (Wave 6)
  organizationId, projectId?, fundingAgreementId?, period, payload JSON, attachments
  status: submitted → under_review → accepted | returned
```

`StudyVote` rows migrate into `VoteRound(subject=ProjectStudy)` + `Vote` (Wave 3); `StudyVote` table frozen, dropped Wave 8.

## 5. Workflow engine (Wave 4) — entities defined in `04_WORKFLOW_ENGINE.md`
`WorkflowDefinition, WorkflowState, WorkflowTransition, WorkflowInstance, WorkflowStepLog`.

## 6. Audit (Wave 0)

```
AuditLog (append-only; DB role has INSERT/SELECT only)
  timestamp, actorUserId, actorOrgId, action ("verb.noun"),
  subjectType/subjectId, before/after JSON snapshots, requestId, ip
```

## Relationship overview

```
Organization ──< OrganizationMembership >── User ──< RoleAssignment (scoped)
Organization ──< Project (owner) · ──< ProjectParticipation >── Project
Organization ──< FundingAgreement >── Fund ──< FundMembership >── User
Fund ──< FundAllocation >── Project ; allocation ← approved by ← BoardDecision
Fund/Project ── Account ──< LedgerEntry >── LedgerTransaction (immutable)
Project ── WorkflowInstance ── WorkflowDefinition(version)
decidable subject ── VoteRound ──< Vote ; BoardDecision → VoteRound
every mutation ──> AuditLog (event-driven, append-only)
```

## Connections
- Who may touch what: `08_PERMISSIONS_RBAC_ABAC.md`.
- How columns are introduced/backfilled/retired: `09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md`.
- Wave that owns each entity: table in `10_IMPLEMENTATION_WAVES_PLAN.md`.
