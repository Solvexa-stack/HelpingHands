# Backlog — Wave 6: Municipal Integration
Source: [`../17_WAVE_6_MUNICIPAL_INTEGRATION.md`](../17_WAVE_6_MUNICIPAL_INTEGRATION.md) · Activation wave: pilot first, GA after sign-off.

---

## Epic W6-E1 — Participation & agreements schema/modules

**S1 · M · db,api — `ProjectParticipation`**
Do: Migration + service: org↔project roles (`owner|executing_agency|funding_partner|supervising|beneficiary_rep`); policy conditions consuming participation (e.g. `project.report.submit` per `../08`); audited.
AC: Adding a participation changes `can()` outcomes (spec); project detail API exposes participations.
Deps: W5 done

**S2 · M · db,api — `FundingAgreement`**
Do: Migration + service: fund↔org terms, reporting schedule, status; allocations reference an agreement; policy hook: overdue reports can block further disbursements (per agreement terms).
AC: Allocation under an agreement e2e; disbursement-block rule spec.
Deps: S1

**S3 · M · db,api — `ProgressReport` / `FinancialReport`**
Do: Migration + service: submit (org, per schedule or ad hoc) → under_review → accepted|returned; attachments via `File`; notifications on schedule due/overdue.
AC: Report lifecycle e2e incl. returned-with-comments path; overdue flag raised by schedule job.
Deps: S2

## Epic W6-E2 — Category taxonomy

**S1 · M · db,migration — `ProjectCategoryNode` + backfill**
Do: Hierarchical table with i18n names (civic taxonomy per `../03` §2 incl. social_support children); `Project.categoryId` additive column; deterministic enum→node mapping backfill; legacy enums frozen read-only after reader cutover.
AC: 100% projects carry `categoryId`; mapping review recorded; both enums unwritten-to (test).
Deps: W5 done

**S2 · M · api,migration — Study templates re-key**
Do: `StudyDepartmentTemplate.projectType` mapped to category nodes; mapping reviewed against every template row; civic template sets authored (at minimum: infrastructure study sections for municipal projects) with i18n.
AC: Template generation regression green for legacy categories; new civic category generates its sections.
Deps: S1

**S3 · S · admin-ui,web-ui — Category UI**
Do: Category pickers (hierarchical) in project creation/filters; web project pages show category; locale-aware labels.
AC: Create + browse by civic category in all three locales.
Deps: S1

## Epic W6-E3 — Municipality onboarding

**S1 · M · api — Activate `org-verification` workflow + municipality flag**
Do: Activate W4-authored definition (`submitted → under_review → verified → active`, Board decision + document guards); self-service registration endpoint (flag-gated, allowlist); municipality default capabilities per `../05`.
AC: E2E: register → upload official documents → Board decision → active org with correct capabilities.
Deps: W4-E6-S1, W3-E2

**S2 · M · admin-ui — Onboarding UX + Board verification queue**
Do: Registration/verification screens; Board queue gains verification requests (extends W3 queue).
AC: Full onboarding operable from UI; queue counts correct.
Deps: S1

## Epic W6-E4 — Lifecycle variants

**S1 · M · api — Activate `project-lifecycle` v2 (board_review)**
Do: Activate for orgs with `requiresBoardOversight`; definition selection at `start()` by owner-org capabilities; running instances stay pinned v1.
AC: New oversight-org project passes through `board_review` (decision guard); existing projects unaffected (spec).
Deps: W6-E3-S1

**S2 · S · api — Activate `emergency-relief` definition**
Do: Board fast-track flow (no public voting); Board-only initiation via policy.
AC: E2E in staging: creation → Board decision → donations → execution (wave-doc DoD requires staging exercise minimum).
Deps: S1

## Epic W6-E5 — Joint projects

**S1 · M · api,admin-ui — Cross-org execution**
Do: Project-scope grants (`contributor`, `financial_delegate`) for executing-agency members (uses W2 D2 user-FKs); assignee pickers include participation-org members; participations manageable from project settings (owner org + Board).
AC: E2E: NGO-owned project, municipality executing_agency, municipal engineer assigned a task and completing it; leak test still green (participation grants scope to that project only).
Deps: E1-S1

**S2 · S · web-ui — Public display**
Do: Project pages show participating organizations and roles (additive).
AC: Joint project renders both orgs; URLs unchanged.
Deps: S1

## Epic W6-E6 — Reporting UX

**S1 · M · admin-ui — Org reporting workspace + Board review**
Do: Org: report composer (progress/financial, attachments), schedule calendar, submission status; Board queue gains submitted reports + overdue flags.
AC: Municipality submits both report types; Board reviews/accepts/returns from queue.
Deps: E1-S3

## Epic W6-E7 — Pilot & GA

**S1 · L · qa,docs — Pilot municipality program**
Do: Onboard one real municipality (allowlist): verification → funded infrastructure project (v2 lifecycle, board_review exercised) → agreement + allocation → execution with municipal staff → progress + financial reports accepted. Findings filed as stories; definition adjustments made as data changes.
AC: Every wave-doc DoD pilot bullet satisfied with evidence.
Deps: all epics

**S2 · S · infra,docs — GA + wave close**
Do: Enable municipality/youth_team types generally after pilot sign-off; DoD walk; `PROGRESS.md` (W6 ✅).
AC: Checked with evidence; allowlist removed.
Deps: S1
