# User Manual

> **Audience:** Every person who will use HelpingHands — platform staff, Board members, organization staff, and the public.
> **Scope:** Reflects the actual screens and buttons in `apps/admin` and `apps/web` as of Waves 0–7. Nothing in this manual is aspirational — where a feature is described in project planning docs but not yet built, it is marked **NOT IMPLEMENTED**.
> **Conventions:** `[Insert screenshot here]` marks where a screenshot should be added when this manual is prepared for print/training. Buttons and menu labels are written as they appear in the English UI; the same screens are fully available in Arabic (RTL) and French unless noted otherwise.

---

## 0. Before you start

### 0.1 The two applications

| Application | URL (local/dev) | Who uses it |
|---|---|---|
| **Admin app** (`apps/admin`) | `http://localhost:3001` | Platform staff, Board members, and all organization staff (NGO/municipality/youth-team employees). One login, one app — the screens you see depend on your role. |
| **Public website** (`apps/web`) | `http://localhost:3200` | Citizens/donors: browsing projects, donating, voting, and viewing the Transparency Portal. |

### 0.2 The two role systems (read this once — it explains a lot of what follows)

HelpingHands has two authorization layers that you will see referenced throughout the admin app:

1. **Legacy platform roles** — `administrator`, `employee`, `financial_officer` (plus `participant` for the public). These control the **Platform Workspace** sidebar (which platform-wide pages you see) and are what the four seeded test accounts use.
2. **Scoped roles** — finer-grained roles attached to a specific organization, fund, or project (e.g. `org_admin`@your-organization, `fund_director`@a-fund, `project_lead`@one-project). These control day-to-day actions inside a workspace: who can submit a report, approve an allocation, or edit a project.

A platform `administrator` is **automatically** also granted `board_chair` (platform scope) and `org_admin` (their default organization's scope). The reverse is not true — being `org_admin` for one organization does not make you a platform Administrator.

### 0.3 The three workspaces in the admin app

| Workspace | URL prefix | Who lands here | Purpose |
|---|---|---|---|
| **Platform Workspace** | `/dashboard`, `/projects`, `/organizations`, `/funds`, `/workflow`, `/audit`, `/employees`, `/content/*`, `/languages`, `/reports`, `/studies` | Anyone holding *any* platform-scope role (Administrator, Employee, Financial Officer, or a Board seat) | Cross-organization administration and content management |
| **Organization Workspace** | `/org/dashboard`, `/org/projects`, `/org/studies`, `/org/donations`, `/org/reports`, `/org/team`, `/org/settings` | Anyone whose *only* role is organization-scoped (no platform grant) | A single organization's own work — scoped so you cannot see or reach any other organization's data |
| **Board** | `/board` (one page, six tabs) | Anyone with a platform-scope role — visible in the sidebar only if you also hold `administrator`, and functionally gated by holding a Board seat (`board_chair`/`board_member`/`board_secretary`/`platform_auditor`) | Cross-organization governance: review queue, verifications, report review, dashboards, decision history |

There is no separate login for each workspace — your account's roles determine which one(s) you can reach, and a "Switch context" action lets platform/Board users step into a specific organization's workspace when needed.

---

## 1. Platform Admin

**Who this is:** the seeded `administrator` role (`admin@helpinghands.org`). Full access to everything; the only role with no technical restrictions.

### 1.1 Dashboard (`/dashboard`)
- **Purpose:** at-a-glance platform health: total projects, donations, participants, revenue; a monthly donations chart; recent donations and recent projects.
- **Permissions:** `administrator`, `employee`, `financial_officer`.
- **Buttons:** none that mutate data — this is a read-only overview.
- **Expected result:** numbers match what you'd count by hand in Projects/Donations; the headline figures are delegated from the same read layer that powers the public Transparency Portal, so they should never disagree with it.

`[Insert screenshot here]`

### 1.2 Projects (`/projects`, `/projects/new`, `/projects/[id]`, `/projects/[id]/edit`)
- **Purpose:** create and manage every project on the platform, regardless of owning organization.
- **Permissions:** list/view — `administrator`, `employee`, `financial_officer` (public read also exists at `GET /projects` for the website); create/edit — `administrator`, `employee`; delete — `administrator` only; assign a financial officer — `administrator` only.
- **Buttons:** "New Project", "Edit", "Delete" (confirm dialog), "Assign Officer", "Create Study" (shortcut into the Studies module).
- **Forms:** name/translations (English/Arabic/French tabs), civic category (picked from the taxonomy tree — see `DEMO_DATA.md` for the full list), owning organization, fund of record, target value, location, expected start date, cover image.
- **Workflow:** creating a project is a two-step operation under the hood (a content `Block` is created first, then the `Project` linked to it) — the form does both steps for you in one submit.
- **Validation:** value must be a positive decimal; a fund of record is optional today (`PROJECT_FUND_REQUIRED=false` by default) but becomes mandatory if that flag is flipped on.
- **Expected result:** the new project appears immediately in both the admin list and the public website's project grid.
- **Sub-pages:** `/projects/[id]/execution` (tasks/phases), `/projects/[id]/financial` (budgets/expenses/transactions), `/projects/[id]/milestones` — see §1.9–1.11 below (identical pages, described once).

`[Insert screenshot here]`

### 1.3 Studies (`/studies`, `/studies/[id]`, `/studies/[id]/votes`, `.../sections/[sectionId]`)
- **Purpose:** the formal written justification behind a project — sections, status, and (for the standard lifecycle) public voting results.
- **Permissions:** list/detail — `administrator`, `employee`, `financial_officer`; create/edit sections, change status — `administrator`, `employee`; delete — `administrator`.
- **Buttons:** "Change Status" (opens a modal — see Workflow below), section edit, file upload per section, "View Votes" (audit trail with CSV export).
- **Workflow:** status moves through the workflow engine: `draft → in_review → published → voting_open → voting_closed → approved/rejected → donations_open → executing → completed`. For organizations with `requiresBoardOversight`, `voting_closed` routes to a `board_review` state instead of going straight to `approved`/`rejected`. The status-change modal only shows actions the workflow engine currently allows for your role — if a button is missing, it's because a guard (e.g. "all sections must be complete first," or "requires a Board decision") isn't satisfied yet, not a bug.
- **Validation:** required sections (per the category's department template) must be marked complete before the study can be submitted for review, in the v2 (Board-oversight) lifecycle.
- **Expected result:** status changes are reflected immediately on the project's public page and, once `approved`, unlock the donations stage.

`[Insert screenshot here]`

### 1.4 Donations (`/donations`)
- **Purpose:** review and act on every cash (QR) donation across the platform.
- **Permissions:** `administrator`, `employee`, `financial_officer`.
- **Buttons:** "Scan QR" (see note below), "Approve" / "Reject" (opens a reason modal), status filter.
- **Important — how "Scan QR" actually works:** it opens a **text box**, not a camera. Staff paste or type the 32-character token (or the full donation URL — pasting the URL auto-extracts the token) printed under the donor's QR code, then look it up and approve/reject. Do not expect to hold a printed QR code up to a webcam — that is not implemented; only server-generated QR *images* exist (for the donor to display/print), not client-side scanning.
- **Workflow:** `pending → approved / rejected / cancelled`. Once approved or rejected, status cannot change. Cancellation is participant-initiated (from the public site), not staff-initiated.
- **Expected result:** approving a donation immediately recalculates the project's funding progress and posts a ledger entry (see `SYSTEM_ARCHITECTURE.md` §6); the donor sees the new status on their dashboard and donation page.

`[Insert screenshot here]`

### 1.5 Participants (`/participants`, `/participants/[id]`)
- **Purpose:** manage donor/citizen accounts.
- **Permissions:** `administrator`, `employee` (list); a participant may only view/edit their own record.
- **Buttons:** "Toggle Active" (deactivate/reactivate an account).
- **Expected result:** a deactivated participant can no longer log in; their historical donations remain visible.

### 1.6 Employees (`/employees`)
- **Purpose:** manage platform staff accounts — the legacy `administrator` / `employee` / `financial_officer` roles.
- **Permissions:** `administrator` only. **Platform-only** page — hidden from anyone without a platform-scope role.
- **Buttons:** "Create Admin" (modal: name, email, password, role), "Edit" (modal), "Toggle Active".
- **Validation:** email must be unique across the whole platform (shared with participant accounts, since both are `User` rows).
- **Expected result:** a new employee can immediately log in with the assigned role and sees the sidebar appropriate to that role.

`[Insert screenshot here]`

### 1.7 Content — Blogs / News / Events / About (`/content/blogs`, `/content/news`, `/content/events`, `/content/about`, each with `/new` and `/[id]/edit`)
- **Purpose:** the platform's CMS for public-facing site content, entirely separate from project/donation data.
- **Permissions:** `administrator`, `employee`.
- **Buttons:** "New", "Edit", "Delete" (confirm dialog).
- **Forms:** a single shared form (English/Arabic/French tabs) — title, slug (auto-generated from title, editable), brief, description (rich text editor), image, published toggle. Events additionally get start/end dates; About sections additionally get a classification and display order.
- **Validation:** slug must be unique across all content types.
- **Expected result:** published content appears on the public site immediately in all three languages (whichever tabs were filled in — an empty translation falls back to English on the public site).

`[Insert screenshot here]`

### 1.8 Languages (`/languages`)
- **Purpose:** the **content-translation** language registry — which languages `Content` (§1.7) and project descriptions can be translated into. This is unrelated to the admin app's own UI language switcher (see §0 and the header language `<select>`).
- **Permissions:** `administrator`.
- **Buttons:** "Add Language" (name, code, flag, text direction, display order), "Remove".
- **Expected result:** a newly added language appears as a new translation tab on every content form; removing one does not delete existing translations, just hides the tab.

### 1.9–1.11 Project sub-pages: Execution / Financial / Milestones
These three pages exist per-project (`/projects/[id]/execution`, `/financial`, `/milestones`) and are identical in both the Platform and Organization workspaces.

| Page | Purpose | Buttons | Permissions |
|---|---|---|---|
| **Execution** | Track Steps, Phases, and Tasks through `pending → assigned → in_progress → completed`. | Add Phase/Task, change status, assign to a team member. | `administrator`, `employee` (platform) / `project_manager`, `staff` (org) |
| **Financial** | Manage per-project Budgets, Expenses (own pending → approved/rejected sub-status), and manual Transactions; a Summary tab. | Add Budget, Add Expense, Approve/Reject Expense, Add Transaction. | `administrator` (full); `employee`/`financial_officer` per verb — **note:** a known gap (BUG-5, tracked in the backlog) means financial-officer project *assignment* is not yet enforced on these specific routes the way it is on Donations — any financial officer can currently act on any project's budgets/expenses. |
| **Milestones** | Track target dates and completion status for major project checkpoints. | Add Milestone, mark complete. | `administrator`, `employee` |

`[Insert screenshot here]`

### 1.12 Reports (`/reports`)
- **Purpose:** generate downloadable per-project reports.
- **Permissions:** `administrator`, `financial_officer`.
- **Buttons:** six report types — PDF Summary, PDF Financial, PDF Progress, Excel Financial, Excel Donations, Excel Expenses — each downloads directly once a project is selected.
- **Expected result:** file downloads immediately with the project's current data as of the moment of generation (not cached).

### 1.13 Organizations (`/organizations`) — Platform-only
- **Purpose:** the multi-tenant organization registry: create, verify, and manage every NGO/municipality/youth-team/initiative on the platform.
- **Permissions:** `administrator` only.
- **Buttons:** "Create Organization", "Invite Admin" (send an activation-link invite to that org's first user), "Manage Members" (grant/revoke org-scoped roles), "Toggle Capabilities" (canExecuteProjects, canReceivePublicFunds, canOpenDonations, isGovernmentEntity, requiresBoardOversight), "Suspend"/"Activate", "Open Workspace" (jump into that org's `/org/dashboard` as a platform admin, via switch-context).
- **Workflow:** new organizations start `pending_verification`; verification itself happens through the Board's Verifications tab (§2.2), not from this page directly, though an Administrator acting as Board Chair can do both.
- **Validation:** registration number is not currently validated against any external registry (self-reported).
- **Expected result:** a suspended organization's users immediately lose write access (read access to historical data remains); toggling a capability off takes effect on the next action attempted (e.g. turning off `canExecuteProjects` blocks new project creation for that org).

`[Insert screenshot here]`

### 1.14 Funds (`/funds`) — Platform-only
- **Purpose:** manage pooled treasury funds, their officers, and their allocation pipeline.
- **Permissions:** `administrator` only for management; the five fund-officer roles (`fund_director`, `fund_deputy`, `fund_secretary`, `fund_accountant`, `fund_controller`) get scoped permissions enforced server-side, not shown/hidden differently in this UI.
- **Buttons:** "Create Fund", "Manage Officers", "Propose Allocation", "Approve"/"Reject" Allocation, "Disburse Tranche", "Reconcile", "Close", "Freeze"/"Reactivate", "Export CSV Statement".
- **Workflow:** allocation lifecycle `proposed → board_approved → disbursing → reconciled → closed` — each stage change is a real state transition, not a status dropdown; unavailable actions are hidden per the same `availableTransitions` mechanism as Studies.
- **Validation:** disbursement above a fund's `policy.dualApprovalThreshold` requires a second officer's approval or a Board decision (segregation of duties — see `SYSTEM_ARCHITECTURE.md` §6). A frozen fund blocks new allocations/disbursements but never hides history.
- **Expected result:** each stage transition posts (or, for `proposed`, does not yet post) matching ledger entries — visible in the fund's dashboard and the public fund statement once policy-published.

`[Insert screenshot here]`

### 1.15 Workflow (`/workflow`) — Platform-only, read-only viewer
- **Purpose:** inspect the state-machine definitions actually driving project/study/organization/allocation lifecycles.
- **Permissions:** `administrator`, `employee`, `financial_officer` (view only — there is no generic "edit a workflow definition" screen; definitions are seeded/authored in code).
- **What you'll see:** each definition's states, transitions, and the guards attached to each transition (e.g. "requires role: board_chair or board_member," "requires a board_decision: approved"). A per-project lifecycle timeline (with clickable action buttons where your role permits) is also embedded directly on each Project detail page — this page is the definition-level view, not the instance-level view.
- **Expected result:** a municipality-type project (with `requiresBoardOversight`) visibly includes the extra `board_review` state; a standard NGO project does not.

`[Insert screenshot here]`

### 1.16 Audit (`/audit`) — Platform-only
- **Purpose:** the append-only record of every mutating action on the platform.
- **Permissions:** `administrator` only.
- **What you'll see:** actor, action (e.g. `donation.approved`), subject, before/after JSON snapshot, timestamp, request id. Color-coded by action type.
- **Validation:** there is no edit or delete control anywhere on this page — audit rows cannot be modified through any UI, by design.
- **Expected result:** any mutating action you take elsewhere in the admin app appears here within moments.

`[Insert screenshot here]`

---

## 2. Board

**Who this is:** users holding a `platform`-scope role — in practice, the seeded Administrator (auto-granted `board_chair`), plus anyone else explicitly granted `board_chair`/`board_member`/`board_secretary`/`platform_auditor`.

> ⚠️ **Known gap:** there is currently no self-service screen to grant someone a Board seat *other than* making them a platform Administrator (which grants `board_chair` automatically). Assigning a distinct `board_member`, `board_secretary`, or `platform_auditor` seat today requires direct database/seed intervention by the delivery team. If your deployment needs a multi-person Board with differentiated seats, raise this with the technical team before go-live.

The Board is reached via one page, `/board`, with six tabs (not six separate URLs). It appears in the sidebar under **Board** but is functionally visible to anyone with `hasBoardWorkspace = true` and the sidebar nav item additionally requires the `administrator` role to display — meaning, in practice, non-administrator Board seat holders can still reach `/board` directly by URL even if the sidebar link is hidden for them.

### 2.1 Queue tab
- **Purpose:** the cross-organization inbox of studies awaiting review (`in_review`, `voting_open`, `voting_closed`).
- **Buttons:** "Publish", "Close Voting", "Approve", "Reject", "Request Changes" — each opens the shared decision modal.
- **Expected result:** live vote tallies are shown inline where a study is in `voting_open`/`voting_closed`.

`[Insert screenshot here]`

### 2.2 Verifications tab
- **Purpose:** the organization-onboarding queue — pending registrations moving through `submitted → under_review → verified → active` (or `rejected`).
- **Buttons:** "Begin Review", "Verify", "Reject", "Activate".
- **Validation:** "Verify" is blocked until the organization's registration documents are on file (`documents_present` guard).

### 2.3 Reports tab
- **Purpose:** review submitted organization progress/financial reports.
- **Buttons:** "Begin Review", "Accept", "Return" (requires a comment). Overdue reports are flagged.
- **Expected result:** returning a report notifies the submitting organization and, if its funding agreement is configured to block disbursements on overdue reports, holds further fund release until resubmission and acceptance.

### 2.4 Dashboard tab
- **Purpose:** cross-entity KPIs — decision throughput (including median queue age), overdue reports, funds comparison — sourced from the same read layer as the public Transparency Portal.
- **Notable panel:** a **Publication Policy** snapshot, showing the current visibility (`public`/`workspace_only`/`never_public`) of each of the 9 field classes. As currently built this panel is a **viewer**, not an editor — changing a policy value requires the `PATCH /transparency-policy/:fieldClass` endpoint directly; there is no "Save" button wired to it in the admin UI yet. Treat policy changes as a task for the technical team until an editor ships.

`[Insert screenshot here]`

### 2.5 History tab
- **Purpose:** the full, immutable Board decision log — subject, decision, mandatory rationale, decided-by, timestamp.
- **Expected result:** no edit/delete affordance exists anywhere on this tab, by design; a correction always appears as a *new* decision, never a change to an old one.

### 2.6 Projects tab
- **Purpose:** a cross-organization projects table for Board reference (marked in the codebase as a placeholder retained from an earlier wave — expect this to be superseded by richer Board project tooling in a future iteration).

---

## 3. Organization Admin

**Who this is:** a user with `org_admin` at their organization's scope — the highest authority *within* one organization's workspace, without any platform-wide power.

You land at `/org/dashboard` after logging in (or after using "Switch Context" if you also hold a platform/Board role). The Organization Workspace sidebar has exactly **7 items**: Dashboard, Projects, Studies, Donations, Reports, Team, Settings — no CMS, no cross-organization anything.

### 3.1 Org Dashboard (`/org/dashboard`)
- **Purpose:** this organization's own numbers only — projects, donations, collected amounts, open votes, funding received, and an upcoming/overdue report calendar.
- **Expected result:** figures never include any other organization's data — this is enforced server-side (tenancy scoping), not just hidden in the UI.

### 3.2 Projects, Studies, Donations (`/org/projects`, `/org/studies`, `/org/donations`)
These are **the same screens** described in §1.2–1.4, scoped to your organization automatically. Everything documented there (buttons, workflow, validation) applies identically here — the only difference is you will never see, and cannot reach by guessing a URL, another organization's project/study/donation. Attempting to open a foreign project by pasting its ID returns "not found," not "forbidden" — deliberately, so you cannot even confirm another organization's data exists.

`[Insert screenshot here]`

### 3.3 Reports (`/org/reports`) — Organization-only page
- **Purpose:** compose and submit progress/financial reports to the Board; track their status and see upcoming/overdue obligations computed from your funding agreements.
- **Buttons:** "New Report" (type: progress or financial; period; narrative/metrics payload; file attachments), "Resubmit" (for returned reports).
- **Workflow:** `submitted → under_review → accepted | returned`.
- **Validation:** if your organization has a funding agreement with `blockDisbursementsOnOverdueReports` set, an overdue report will visibly hold further allocation disbursement until submitted and accepted.
- **Expected result:** submitted reports appear immediately in the Board's Reports queue (§2.3).

`[Insert screenshot here]`

### 3.4 Team (`/org/team`) — Organization-only page
- **Purpose:** invite and manage this organization's own staff and their roles.
- **Buttons:** "Invite Member" (email — sends an activation-link invite), "Assign Role" (`org_admin`, `project_manager`, `staff`, `org_accountant`, `viewer`), "Remove Member".
- **Validation:** you cannot grant a platform-scope role or a Board seat from here — those remain Administrator/Board-only actions.
- **Expected result:** an invited member who activates their account lands directly in this organization's workspace with the assigned role's permissions.

`[Insert screenshot here]`

### 3.5 Settings (`/org/settings`) — Organization-only page
- **Purpose:** edit your organization's own profile — name, registration number — and view (not edit) its current capability flags.
- **Buttons:** "Save".
- **Expected result:** capability changes are **not** available here — only the Board/platform Administrator can toggle capabilities (§1.13), by design (an organization shouldn't be able to self-grant `canReceivePublicFunds`).

---

## 4. Project Manager

**Who this is:** `project_manager`@organization (granted from the Team page, §3.4), or `project_lead`@project for staff from a *partner* organization working on one shared/joint project (granted from that project's Participations panel).

**What you can do:** everything in Execution/Financial/Milestones (§1.9–1.11) and Studies (§1.3, section content) for your assigned organization or project — create/update tasks, phases, milestones; submit budgets and expenses.

**What you cannot do:** grant roles to others (that's `org_admin`'s job), approve fund allocations, or make Board decisions.

**Where you land:** `/org/dashboard`, same as any organization-scoped user. A `project_lead`@project user (joint-project staff without organization membership) sees only the one project they're granted on, via the Participations mechanism — not the organization's full project list.

---

## 5. Staff

**Who this is:** either the legacy platform-wide `employee` role (seeded as `employee@helpinghands.org`), or the organization-scoped `staff` role (granted via Team page for day-to-day org work).

| | Legacy `employee` | Org-scoped `staff` |
|---|---|---|
| Where you land | Platform Workspace, `/dashboard` | Organization Workspace, `/org/dashboard` |
| What you see | Dashboard, Donations, Projects, Studies, Participants, Content — **not** Organizations/Funds/Workflow/Audit (Administrator-only) | Your organization's Dashboard, Projects, Studies, Donations, Reports, Team, Settings |
| Typical actions | Approve/reject cash donations, edit projects/studies, manage CMS content | Same day-to-day actions, scoped to your own organization |

---

## 6. Volunteer

> ⚠️ **NOT IMPLEMENTED as a distinct system role.** There is no `volunteer` entry in the scoped role catalog (`organization` scope offers `org_admin`, `project_manager`, `staff`, `org_accountant`, `viewer` — see `SYSTEM_ARCHITECTURE.md` §4.1). If your organization wants to give someone volunteer-level access today, the closest fit is:
> - **`viewer`**@organization — read-only access to your organization's projects, studies, donations, and reports; cannot create, edit, approve, or submit anything.
> - **`staff`**@organization — if the volunteer needs to actually do day-to-day work (e.g. help process donations or update tasks).
>
> If a dedicated, more restricted "Volunteer" role is required (e.g. for unpaid community helpers who shouldn't see financial figures), that is a feature request for the delivery team, not a configuration you can enable today.

---

## 7. Donor

**Who this is:** a self-registered `participant` account on the public website (`apps/web`), donating in cash (QR) or online.

### 7.1 Register / Login (`/auth/register`, `/auth/login`)
- **Purpose:** create or access a donor account.
- **Form:** first name, last name, email, password (must include upper+lower+digit+special character, minimum 8), and an account type (`personal`, `company`, or `organization` — a self-description field, unrelated to the `Organization` entity used by NGOs/municipalities).
- **Expected result:** successful registration logs you in immediately and lands you on `/dashboard`.

`[Insert screenshot here]`

> ⚠️ **Known gap:** the login page's "forgot password" link points at a page that does not exist on the public website (`/auth/forgot-password` is not implemented as a page, though the underlying API endpoints exist). Treat password reset as unavailable for donors until this is built.

### 7.2 Browse & Donate (`/projects`, `/projects/[id]`)
- **Purpose:** browse public projects and fund one.
- **Buttons:** "Donate → Cash" or "Donate → Online" (only shown if the project's study status allows it and the project isn't already complete).
- **Cash flow:** pick/enter an amount → a QR code and downloadable image are generated immediately, encoding a link to your donation's status page. Bring the printed/displayed QR (or just the underlying link/token) to the organization in person along with the cash.
- **Online flow:** pick an amount and currency → redirected to a Stripe or PayPal hosted checkout page → redirected back to a success or cancel page on return.
- **Validation:** only accounts with `referenceType = participant` can donate — organization/admin accounts are blocked from this flow client-side.
- **Expected result (cash):** your donation shows as `pending` until staff verify and approve it; the project's progress bar updates the moment it's approved.
- **Expected result (online):** on successful payment, status updates automatically via the payment provider's webhook.

`[Insert screenshot here]`

### 7.3 My Dashboard (`/dashboard`, `/dashboard/profile`)
- **Purpose:** your own donation history (cash and online, in separate tabs), your voting history, and notifications.
- **Buttons:** re-download a pending donation's QR, print an online-donation receipt, edit your profile (name, account type — email is read-only).
- **Expected result:** every donation you've made appears here with its current status.
- ⚠️ **Known gap (BUG-7, open):** the underlying link between a participant's account and its profile data is not populated on account creation, which means the "edit profile" save can currently fail for the account owner. It also means donation-approval emails are silently never sent (independent of whether SMTP itself is configured). If profile edits or approval emails don't appear to work during testing, this is the known cause — see `ROADMAP.md` → Technical Debt.

### 7.4 Vote (on a project's Study tab)
- **Purpose:** cast a for/against/abstain vote (with an optional comment) on a published study during its open voting window.
- **Validation:** one vote per study per user; only available while the study is in `voting_open` and only for studies that follow the public-voting lifecycle (municipal/Board-oversight projects skip public voting — see `BUSINESS_FLOW.md` §2.6).

---

## 8. Participant

In this platform, **"Participant" and "Donor" are the same account type** (`Representation ∈ {personal, company, organization}` is a self-description, not a separate role). Everything in §7 applies. The term "Participant" is also what the admin app's Participants page (§1.5) calls this account type internally.

---

## 9. The Public Transparency Portal (no account required)

Although not one of the eight roles above, every one of them — and every citizen with no account at all — can use this. Reachable from the public website's navbar (`Transparency`) at `/transparency`.

| Page | URL | What it shows |
|---|---|---|
| Hub | `/transparency` | Platform-wide statistics, intake by channel, projects by category, organizations by type, a funds overview, an organization directory |
| Fund detail | `/transparency/funds/[id]` | Balance, intake, allocated, disbursed; spend by category; allocations to projects; **Download statement (CSV)** |
| Organization detail | `/transparency/organizations/[id]` | Profile, verified badge, project portfolio |
| Project money trail | embedded on `/projects/[id]` | Intake → account credit → spend category; funding sources (including named funds); full Board decision history for that project; "as of" freshness timestamp |

**Expected result:** every figure shown here is sourced from the same read layer as the internal Board dashboard — they cannot disagree. Donor identities and beneficiary personal data are never shown here, by hard design (see `SYSTEM_ARCHITECTURE.md` §8), regardless of publication policy settings.

`[Insert screenshot here]`

---

## Related documents
- `ADMIN_ACCEPTANCE_TEST.md` — a checklist to verify every screen in this manual actually behaves as described.
- `BUSINESS_FLOW.md` — why these steps exist, in process order.
- `DEMO_DATA.md` — concrete accounts/organizations/projects to practice with.
