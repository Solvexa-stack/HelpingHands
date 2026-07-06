# 01 — Current System Analysis

## Purpose
Establish a shared, codebase-verified understanding of what exists today, so every later document builds on facts rather than assumptions. This is the baseline against which "backward compatible" is measured.

## Problems this document solves
- Prevents redesign of things that already work (the lifecycle, donations, i18n).
- Names the five structural debts that every wave must route around or repair.
- Defines exactly which behaviors are frozen (must not change) during migration.

## What exists (verified)

### Stack & repo layout
- pnpm monorepo: `apps/api` (NestJS, port 4000), `apps/web` (Next.js public site), `apps/admin` (Next.js dashboard), `packages/database` (Prisma + PostgreSQL).
- API modules: `admins, auth, blocks, dashboard, donations, email, execution, files, financial, languages, milestones, notifications, participants, payments, projects, qr, reports, study, voting`.
- Global `JwtAuthGuard` + `RolesGuard` via `APP_GUARD`; `@Public()` and `@Roles(...)` decorators.

### The frozen lifecycle (must keep working unchanged until Wave 4 wraps it)
```
Project created → ProjectStudy (sections from StudyDepartmentTemplate per ProjectType)
→ sections assigned/completed → study published → voting_open (StudyVote)
→ voting_closed → approved | rejected
→ donations: ProjectDonation (physical, QR token, employee scan+approve)
             OnlineDonation (Stripe/PayPal, WebhookLog)
→ execution: ProjectPhase → ProjectTask, ProjectStep hierarchy, ProjectMilestone
→ financials: ProjectBudget → ProjectExpense; ProjectTransaction journal
→ progress auto-recalculation → closure (isCompleted)
```

### Identity today
- Polymorphic `User` → `Admin` or `Participant` via `referenceType`.
- `AdminRole` global enum: `administrator | employee | financial_officer`.
- Seeded accounts for each role (see project `CLAUDE.md`).

## Strengths to preserve
1. `StudyStatus` is a real state machine with guards — the seed of the workflow engine.
2. `StudyDepartmentTemplate` proves "process shape as data" already works here.
3. Pledge vs. payment separation (QR-physical vs. provider-online donations).
4. Polymorphic `User` absorbs new principal types without auth-core changes.
5. i18n (ar/en/fr) is first-class across content and templates.

## The five structural debts (referenced as D1–D5 everywhere)

| # | Debt | Evidence | Blocks | Fixed in |
|---|---|---|---|---|
| D1 | Execution/financial tables FK to `Block`, not `Project` (`ProjectStep.projectId` → `blocks.id`, same for phases, tasks, budgets, expenses, transactions, milestones) | `schema.prisma` relations named `*Project` pointing at `Block` | Project-scoped permissions, fund allocation joins, reporting | Wave 2 (additive FK), Wave 8 (drop legacy) |
| D2 | All assignees/creators FK to `Admin` (`StudySection.assignedTo`, `ProjectTask.assignedToId`, `ProjectStudy.createdById`) | `schema.prisma` | Municipality/NGO staff as assignees | Wave 2 |
| D3 | Lifecycle states are Prisma enums with transitions in service code | `StudyStatus`, `DonationStatus`, `PhaseStatus`, … | Adding Board review or municipal variants without migrations | Wave 4 |
| D4 | `onDelete: Cascade` on domain relations; hard deletes | `Block → Project`, donations, studies | Audit/immutability requirement | Wave 0 |
| D5 | Global 3-value role enum, no scope dimension | `AdminRole` | All scoped permissions | Waves 1–2, retired Wave 8 |

Also noted: `ProjectCategory` (`agricultural|industrial|trading`) and `ProjectType` (adds `infrastructure|energy|housing`) are overlapping enums — merged into one category table in Wave 6.

## System impact of this analysis
- Every wave doc's "Changes in existing system" section cites these debts by ID.
- QA regression suite for the frozen lifecycle must exist **before Wave 0 ships** (it is Wave 0's first deliverable).

## Connections
- Debt repair schedule: `10_IMPLEMENTATION_WAVES_PLAN.md`.
- Target state each debt migrates toward: `03_DATA_MODEL.md`.
- Compatibility rules governing the repairs: `09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md`.
