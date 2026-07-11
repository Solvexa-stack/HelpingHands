# Demo Data Reference

> **Audience:** Anyone preparing a demo, pilot walkthrough, or training session.
> **Structure:** Part A is **exactly what `pnpm db:seed` actually creates today** — verified against `packages/database/prisma/seed.ts` and its Wave 1/4/5/6/7 backfill/seed scripts. Part B is a **suggested, internally-consistent additional dataset** for a fuller live demo (used by `DEMO_SCRIPT.md`) — these rows do not exist until someone creates them following the steps in that script.

---

## Part A — What `pnpm db:seed` actually creates

### A.1 User accounts

| Email | Password | Admin/Participant role | Scoped grants |
|---|---|---|---|
| `admin@helpinghands.org` | `Admin@123456` | `administrator` ("System Administrator") | `board_chair`@platform + `org_admin`@HelpingHands (org) |
| `employee@helpinghands.org` | `Employee@123` | `employee` ("John Employee") | `staff`@HelpingHands (org) |
| `officer@helpinghands.org` | `Officer@123` | `financial_officer` ("Jane Financial") | `org_accountant`@HelpingHands (org) |
| `participant@example.com` | `Participant@123` | participant ("Ali Hassan"), representation: `personal` | none (participants are not organization members) |

All memberships/grants above come from the Wave 1 identity backfill (`packages/database/prisma/backfills/w1-identity-backfill.ts`), chained automatically at the end of `seed.ts`. Jane Financial (`officer@helpinghands.org`) is also the `financialOfficerId` on the one seeded project.

### A.2 Organizations

| Name | Type | Status | Capabilities |
|---|---|---|---|
| **HelpingHands** | `ngo` | `active` | canExecuteProjects, canReceivePublicFunds, canOpenDonations — all `true`; isGovernmentEntity, requiresBoardOversight — `false` |
| **HelpingHands Board** | `board` | `active` | all capability flags `false` (the Board doesn't execute or fund projects itself) |

### A.3 Funds

| Name | Status | Policy | Managing organization |
|---|---|---|---|
| **Development & Infrastructure** | `active` | `dualApprovalThreshold: 0` | none set |
| **Social Support** | `active` | `dualApprovalThreshold: 0` | none set |
| **Relief & Emergency** | `active` | `dualApprovalThreshold: 0` | none set |

Each fund gets one treasury `Account` (`kind: liability`, `currency: USD`). Purpose text is not seeded (null) — fill in during a demo if needed.

### A.4 Project

| Field | Value |
|---|---|
| Name (en) | Community Water Well Project |
| Name (ar) | مشروع بئر مياه المجتمع |
| Brief (en) | Providing clean water access to rural communities |
| Description (en) | This project aims to drill and install a solar-powered water well serving over 500 families in the remote region, ensuring year-round access to clean, safe drinking water. |
| Location | Rural District, South Region |
| Value | $50,000.00 |
| Category | `agricultural` (legacy enum, resolved to taxonomy node `agricultural`) |
| Expected start date | 2024-03-01 |
| Owning organization | HelpingHands (ngo) |
| Financial officer | Jane Financial |
| Study | none seeded (no `ProjectStudy` row) |
| Workflow state | `donations_open` (derived), `project-lifecycle` v1 |
| Fund of record | none (0 allocations exist, so no fund was auto-assigned — this project sits in the "needs review" bucket) |
| Donations | none seeded |

### A.5 Content

One `about_us` block: **"Our Mission"** (slug `our-mission` / `our-mission-ar`).

### A.6 Languages

| Name | Code | Flag | Direction | Order |
|---|---|---|---|---|
| English | `en` | us | ltr | 0 |
| العربية | `ar` | sa | rtl | 1 |
| Français | `fr` | fr | ltr | 2 |

### A.7 Workflow definitions (all `isActive: true`)

| Key | Version | subjectType | Summary |
|---|---|---|---|
| `project-lifecycle` | v1 | project | draft→in_review→published→voting_open→voting_closed→approved/rejected→donations_open→executing→completed |
| `project-lifecycle` | v2 | project | Same, plus a `board_review` state between voting_closed and approved; capability-gated donations/execution |
| `emergency-relief` | v1 | project | draft→board_review→approved/rejected→executing→completed (no public voting) |
| `org-verification` | v1 | organization | submitted→under_review→verified→active/rejected |
| `fund-allocation` | v1 | fund_allocation | proposed→board_approved→disbursing→reconciled→closed/rejected |

### A.8 Civic category taxonomy — 21 nodes

| Key | Parent | Name (en) | Name (ar) |
|---|---|---|---|
| infrastructure | — | Infrastructure | البنية التحتية |
| roads | infrastructure | Roads | الطرق |
| water | infrastructure | Water | المياه |
| electricity | infrastructure | Electricity | الكهرباء |
| utilities | infrastructure | Public Utilities | المرافق العامة |
| education | — | Education | التعليم |
| healthcare | — | Healthcare | الرعاية الصحية |
| reconstruction | — | Reconstruction | إعادة الإعمار |
| social_support | — | Social Support | الدعم الاجتماعي |
| martyr_families | social_support | Martyr Families | أسر الشهداء |
| widows | social_support | Widows | الأرامل |
| orphans | social_support | Orphans | الأيتام |
| displaced | social_support | Displaced People | النازحون |
| refugees_idps | social_support | Refugees & IDPs | اللاجئون والنازحون داخلياً |
| emergency_relief | — | Emergency Relief | الإغاثة الطارئة |
| salaries_and_aid | — | Salaries & Aid | الرواتب والمساعدات |
| agricultural | — | Agricultural | زراعي |
| industrial | — | Industrial | صناعي |
| trading | — | Trading | تجاري |
| energy | — | Energy | الطاقة |
| housing | — | Housing | الإسكان |

Plus 4 Emergency Relief study department templates (Needs Assessment, Beneficiary Targeting, Logistics & Distribution, Relief Budget) attached to `emergency_relief`, and 55 legacy `ProjectType`-keyed study department templates (agricultural, industrial, infrastructure, energy, housing × 7 type-specific + 4 shared sections each — `trading` has none).

### A.9 Publication policy — 9 field classes

| Field class | Visibility | Description |
|---|---|---|
| `platform.stats` | `public` | Platform-level statistics |
| `fund.totals` | `public` | Fund balances, intake, allocated, disbursed |
| `fund.allocations` | `public` | Per-project allocations from funds |
| `project.funding` | `public` | Project funding totals by channel, progress |
| `project.spend` | `public` | Project money trail |
| `project.decisions` | `public` | Board decision registry entries |
| `org.portfolio` | `public` | Organization profile, verified badge, portfolio |
| `donor.identity` | `workspace_only` | Donor names/emails |
| `beneficiary.data` | `never_public` | Personal beneficiary data — hard-excluded, cannot be opened by policy |

### A.10 What is explicitly NOT seeded

No `ProjectDonation`, `OnlineDonation`, `FundingAgreement`, `OrganizationReport`, `ProjectStudy`, `StudyVote`, `VoteRound`, or `BoardDecision` rows exist on a fresh database. These only appear once created through the app (or, for `StudyVote`→`VoteRound`, if migrating a database that already had legacy studies). This is why Part B below exists — a demo that wants to show donations, votes, reports, or Board decisions has to create them live.

---

## Part B — Suggested additional demo dataset (create live; used by `DEMO_SCRIPT.md`)

Everything below is a **consistent, fictional scenario** — the Municipality of Al-Karama, its water network project, and its partner NGO — designed to exercise every major module in one coherent story. None of it exists until you follow `DEMO_SCRIPT.md`.

### B.1 Organizations to create

| Name | Type | Registration number | Capabilities to set after verification |
|---|---|---|---|
| **Al-Karama Municipality** | `municipality` | `MUN-2026-0417` | canExecuteProjects, canReceivePublicFunds, isGovernmentEntity, requiresBoardOversight — all `true` |
| **Clean Water Alliance** | `ngo` | `NGO-2026-1188` | canExecuteProjects, canReceivePublicFunds, canOpenDonations — all `true` |
| **Al-Karama Youth Initiative** | `youth_team` | `YT-2026-0056` | canExecuteProjects `true`; canReceivePublicFunds `false` (illustrates a smaller, donation-only participant) |

### B.2 Demo user accounts to invite

| Name | Email | Organization | Role |
|---|---|---|---|
| Samir Odeh | `samir.odeh@alkarama.gov.demo` | Al-Karama Municipality | `org_admin` |
| Lina Haddad | `lina.haddad@cleanwater.demo` | Clean Water Alliance | `org_admin` |
| Rami Fares | `rami.fares@cleanwater.demo` | Clean Water Alliance | `project_manager` |
| Dana Youssef | `dana.youssef@alkarama.gov.demo` | Al-Karama Municipality | `org_accountant` |

> Use a throwaway password meeting the complexity rule for all demo accounts, e.g. `Demo@2026!`. Never reuse a demo password in a real deployment.

### B.3 Board seats (beyond the auto-granted `board_chair`)

| Name | Email | Board role |
|---|---|---|
| Farah Nasser | `farah.nasser@board.demo` | `board_member` |
| Khaled Amin | `khaled.amin@board.demo` | `board_secretary` |

> Reminder: no self-service UI grants these seats today (see `USER_MANUAL.md` §2) — create via the seed/backfill mechanism or a one-off script before the demo.

### B.4 Project

| Field | Value |
|---|---|
| Name | Al-Karama Water Network Expansion |
| Category | Infrastructure → Water |
| Owning organization | Al-Karama Municipality |
| Participating organization | Clean Water Alliance, role `funding_partner` |
| Fund of record | Development & Infrastructure |
| Target value | $180,000.00 |
| Location | Al-Karama District, North Region |
| Expected start date | 3 months from the demo date |

### B.5 Study sections (Infrastructure template)

| Section | Example content summary |
|---|---|
| Problem statement | Al-Karama's eastern quarter (est. 4,200 residents) relies on tanker-truck water delivery; the existing network reaches only 60% of households. |
| Objectives | Extend the piped network to the remaining 40%; reduce average household water cost by an estimated 35%. |
| Budget | $180,000 — $95,000 pipes/materials, $60,000 labor, $25,000 contingency. |
| Timeline | 8 months: 2 months survey/permits, 5 months construction, 1 month testing/handover. |
| Documents | Engineering survey (PDF), site photos (images), contractor quote (PDF). |

### B.6 Example donation values (cash/QR)

| Donor | Amount | Status to demonstrate |
|---|---|---|
| Participant `participant@example.com` | $250.00 | `pending` → then approved live |
| A newly self-registered donor "Yousef K." | $1,000.00 | left `pending` to show the staff queue |
| A newly self-registered donor "Mona T." | $75.00 | rejected live (reason: "duplicate submission") to demonstrate the reject path |

### B.7 Example Board decision

| Subject | Decision | Rationale (example text) |
|---|---|---|
| Al-Karama Water Network Expansion — study | `approved` | "Study demonstrates clear community need, realistic budget, and a qualified executing partner. Approved for funding stage per municipal-oversight track." |

### B.8 Example funding agreement

| Field | Value |
|---|---|
| Fund | Development & Infrastructure |
| Organization | Al-Karama Municipality |
| Title | "FY2026 Al-Karama Infrastructure Support Agreement" |
| Terms | `blockDisbursementsOnOverdueReports: true`, `graceDays: 10` |
| Reporting schedule | `frequency: monthly`, `reportTypes: [progress, financial]` |
| Status to demonstrate | `draft` → `active` (signed live) |

### B.9 Example fund allocation

| Field | Value |
|---|---|
| Fund | Development & Infrastructure |
| Project | Al-Karama Water Network Expansion |
| Amount | $120,000.00 (of the $180,000 target — remainder from public donations) |
| Status progression to demonstrate | `proposed` → `board_approved` → `disbursing` (first tranche $40,000) → (leave at `disbursing` for the demo; `reconciled`/`closed` shown as a described-not-performed final stage) |

### B.10 Example organization reports

| Type | Period | Status to demonstrate |
|---|---|---|
| Progress | Month 1 | `submitted` → `accepted` |
| Financial | Month 1 | `submitted` → `returned` (reviewer comment: "Please itemize the $25,000 contingency line before resubmission") → resubmitted → `accepted` |

---

## Consistency notes for whoever runs the demo

- Keep currency in **USD** throughout (matches every seeded `Account.currency`).
- Keep the fictional country/region generic ("North Region," "South Region") unless your actual pilot has a real municipality name to substitute — if so, replace consistently across B.1–B.10, not just the project name.
- If you re-run `pnpm db:seed` between demo sessions, **Part A resets to exactly the state described above** (idempotent upserts) but **Part B does not** — anything created following Part B must be recreated, or you should snapshot a database copy after building the Part B scenario once. See `BACKUP_RECOVERY.md` for how to snapshot/restore a demo database.

## Related documents
- `DEMO_SCRIPT.md` — the live walkthrough script that builds Part B step by step.
- `USER_MANUAL.md` — what each screen used in Part B actually does.
