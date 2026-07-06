# 17 — Wave 6: Municipal Integration

## Goals
Municipalities go live as first-class organizations: verified onboarding, infrastructure/public-service projects, joint projects with NGOs, funding through agreements and allocations, and formal progress/financial reporting. Youth teams reach general availability on the same mechanics. **This wave ships almost no new architecture — it activates what Waves 1–5 built, which is the proof that municipalities required no special-case design.**

## New tables / modules
- **`ProjectParticipation`** (joint/cross-org projects: owner, executing_agency, funding_partner, supervising, beneficiary_rep).
- **`FundingAgreement`** (fund ↔ organization: terms, reporting schedule, status) — the municipal funding channel.
- **`ProgressReport` / `FinancialReport`** (org → Board/fund reporting; statuses submitted → under_review → accepted | returned) + `reporting` additions to the org workspace and Board queue.
- **`ProjectCategoryNode`**: hierarchical category table replacing both legacy enums (`ProjectCategory`, `ProjectType`) — civic taxonomy: infrastructure (roads/water/electricity/utilities), education, healthcare, reconstruction, social_support (martyr families, widows, orphans, displaced, refugees/IDPs), emergency_relief, salaries_and_aid, plus legacy values as nodes.
- Workflow activations (authored Wave 4): `org-verification` v1 (municipality onboarding with Board approval + document guards), `project-lifecycle` v2 (board_review step; selected for orgs with `requiresBoardOversight`), `emergency-relief` v1 (Board fast-track, no public voting).

## What changes in the existing system
- `municipality` (and `youth_team` GA) org-type flags enabled; onboarding runs `org-verification` with official registration documents (existing `File` model).
- **Category migration:** enum columns kept read-only; new `categoryId` column backfilled from a written enum→node mapping; `StudyDepartmentTemplate.projectType` re-keyed to category nodes (templates gain civic variants — e.g. infrastructure study sections for municipal projects).
- Joint projects: project pages (admin + web) show participations; assignee pickers include executing-agency members via project-scope grants (`contributor`), using Wave 2's D2 user-FK repair.
- Funding path activated end-to-end: `FundingAgreement` signed → allocations reference it → disbursements to projects the municipality executes → reporting obligations generated from the agreement's schedule.
- Board queue gains: verification requests, submitted reports, overdue-report flags.

## Migration strategy
- Category backfill: "adding a truth" sequence (`09`) — additive column, deterministic mapping, enums frozen after readers migrate (dropped Wave 8).
- **Pilot-first rollout (mandatory):** one real municipality onboarded behind an allowlist; runs one funded infrastructure project through the full chain (verification → project → v2 lifecycle with board_review → agreement → allocation → execution → reports) before the type is generally enabled.
- v2 lifecycle applies to **new** projects of oversight-flagged orgs only; running instances stay pinned to v1 (engine versioning rule, `04`).

## Risks
| Risk | Mitigation |
|---|---|
| Real-world municipal process ≠ modeled process | That's what the pilot is for; v2 definition adjustments are data changes, not migrations — the whole point of Wave 4 |
| Special-case pressure ("just hardcode it for the municipality") | Architecture rule from `02`/`05`: capability flags + workflow guards only; PR review checklist item |
| Category re-keying breaks study template generation | Template generation covered in regression suite; enum→node mapping reviewed against every template row before backfill |
| Reporting becomes a dead letter (submitted, never reviewed) | Board queue surfaces overdue reviews; agreement status can block further disbursements on overdue reports (policy in `FundingAgreement` terms) |
| Government-actor sensitivities (who may see municipal finances) | Same tenancy + transparency rules as every org — no special visibility carve-outs; public exposure decided in Wave 7 policy |

## Dependencies
Wave 2 (workspaces, D2 assignees), Wave 3 (verification decisions), Wave 4 (definitions to activate), Wave 5 (funds/allocations to receive).

## Definition of done
- [ ] Pilot municipality fully onboarded via `org-verification` with documents and a Board decision.
- [ ] One municipal infrastructure project completes: v2 lifecycle (board_review exercised) → funded via agreement + allocation → executed → progress + financial reports submitted and accepted.
- [ ] One joint project live: NGO owner + municipality executing agency, cross-org assignees working via project-scope grants.
- [ ] Civic category taxonomy live; all projects carry `categoryId`; template generation works for a civic category; legacy enums frozen.
- [ ] `emergency-relief` definition activated and exercised at least in staging end-to-end.
- [ ] Municipality/youth-team types generally enabled after pilot review sign-off.
