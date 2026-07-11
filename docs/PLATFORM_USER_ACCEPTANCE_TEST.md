# HelpingHands — Platform User Acceptance Test (UAT) Guide

**Audience:** A government pilot team (municipality staff, NGO partners, board members, and public donors) evaluating HelpingHands before a live pilot. No developer background required.

**How to use this document:** Read Section 1 first to learn the vocabulary. Section 2 tells you which login to use for which test. Section 3 is a full worked example you can literally re-run end to end. Sections 4–6 are checklists — print them, tick boxes as you go. Section 7 tells you what the system *should* do when something goes wrong (so you can tell a real bug from expected behavior). Section 8 is the go/no-go checklist for the pilot sponsor.

> ⚠️ **Read this before you start testing.** As of this writing, four things are **not yet configured** in a way that supports a real pilot, and this guide calls them out wherever they matter:
> 1. **Outgoing email (SMTP) is not set up.** Any flow that says "an email is sent" will not actually deliver an email in this environment — the system falls back to showing the link/token on-screen instead (developer/pilot-test mode only; this fallback is disabled once the system goes to production).
> 2. **Online card payments (Stripe/PayPal) run on placeholder test keys**, not real payment credentials. Treat "Donate Online" as a UI walkthrough, not a real money-movement test, until the pilot's finance team confirms live keys are installed.
> 3. **All passwords, JWT secrets, and database credentials are still development defaults.** These must be rotated before the system is exposed outside a controlled test environment.
> 4. **Assigning someone as a Board Member, Board Secretary, or Platform Auditor has no dedicated screen yet** — today, only the Board Chair seat is reachable (indirectly, by making someone a platform "Administrator"). If your pilot needs a multi-person Board, flag this to the delivery team before go-live rather than expecting to configure it yourself.

---

## 1. Platform Overview

### 1.1 What is HelpingHands?

HelpingHands is a donation and public-project management platform. It lets a **Governance Board** oversee multiple **Organizations** (NGOs, municipalities, youth teams) that each propose and run public-benefit **Projects** — things like "build a water network" or "renovate a school." Every project can be backed by a written **Study** (problem statement, budget, timeline) that the public can review and vote on, and by real money — donated by the public (in cash, verified by QR code, or online by card) or allocated from a managed **Fund** by Board decision. Every peso/dollar/dinar that moves is recorded on an accounting ledger, and a public **Transparency Portal** shows anyone where the money came from, which fund paid for what, who approved it, and how far each project has progressed.

In short: **citizens propose or watch projects → an accountable body reviews and approves → money is tracked to the cent → the public can verify all of it.**

### 1.2 Main Concepts

| Concept | What it means in HelpingHands |
|---|---|
| **Organization** | The core "tenant" of the system. Every NGO, municipality, and youth team is an Organization record with a `type` (`ngo`, `municipality`, `youth_team`, `initiative`) and a set of `capabilities` (e.g. "can execute projects," "can receive public funds," "is a government entity," "requires Board oversight"). Behavior is driven by these capability flags, not by hardcoded rules per type — so a municipality and an NGO use the same screens, just with different permissions and oversight requirements. |
| **Board** | The single governance body that oversees the whole platform. The Board is not a separate app — it's a set of platform-wide roles (**Board Chair**, **Board Member**, **Board Secretary**, **Platform Auditor**) that unlock a dedicated **Board workspace** in the admin app. Every Board decision (approve/reject/request changes) is permanently logged with a mandatory written reason — decisions are never edited or deleted, only superseded by a new decision. |
| **NGOs** | Non-governmental Organizations (`type = ngo`). They can own and execute their own Projects, or partner on a Municipality's project as a "funding partner" or "executing agency." |
| **Municipalities** | Government Organizations (`type = municipality`). Typically flagged `isGovernmentEntity` and `requiresBoardOversight`, which routes their projects through an extra Board sign-off step before execution can begin. |
| **Projects** | The unit of public work (e.g. "Al-Karama Water Network Expansion"). Each project belongs to one **owning Organization**, can have one or more **participating Organizations**, is tagged with a **category**, has a **fund of record**, and tracks its own progress (0–100%) automatically as approved donations and fund disbursements come in. |
| **Studies** | The written justification for a project: problem statement, objectives, budget breakdown, timeline, and supporting documents (images/video/PDF), organized into sections. A study moves through a lifecycle — draft → in review → published → public voting → approved/rejected — before a project can formally proceed. |
| **Funds** | Managed pools of money (e.g. "Municipal Infrastructure Fund"), each with its own status (**active**, **frozen**, **closed**), its own officers, and its own double-entry ledger. Money moves from a Fund to a Project only through a Board-approved **Allocation**, which itself moves through stages: proposed → Board-approved → disbursing (in tranches) → reconciled → closed. |
| **Donations** | Money given by the public, in two forms: **cash donations**, which generate a QR code (and a matching text token/URL) that the donor brings along with the physical cash; and **online donations**, paid by card (Stripe/PayPal) directly to a project or a fund. Every approved donation is reflected in the project's progress bar within seconds. See the note under Section 4/6 on exactly how staff verify a cash donation — it is not a live camera scan. |
| **Workflows** | Behind the scenes, projects and other entities move through formally defined state machines (e.g. the standard project lifecycle: draft → in review → published → voting → approved → donations open → executing → completed). This is what enforces that steps can't be skipped — for example, a municipality's project can be configured to require an extra Board review hop before execution starts. |
| **Reports** | Organizations submit **progress reports** and **financial reports** on their projects, either ad hoc or on a recurring schedule tied to a funding agreement. The Board reviews and accepts or returns each report; overdue reports can block further fund disbursement to that organization. |
| **Transparency Portal** | The public-facing, no-login-required part of the website (`/transparency`) showing platform-wide totals, per-fund intake/allocation/spend, per-organization portfolios, and per-project funding and decision history — the "follow the money" view for any citizen or auditor. |

---

## 2. Test Accounts and Roles

HelpingHands has **two layers** of roles, and understanding the difference will save you a lot of confusion during testing:

- **Legacy admin-app roles** — `administrator`, `employee`, `financial_officer` (plus `participant` for the public). These are what the four seeded test accounts use, and they still control the platform-level admin app sidebar (e.g. only `administrator` sees Organizations, Funds, Workflow, Audit).
- **Scoped roles** (the finer-grained system) — a person can additionally hold roles scoped to a specific **platform** (Board), **organization**, **fund**, or **project**. These are what actually gate day-to-day actions like approving a fund allocation or submitting a report on behalf of one specific organization. A platform "Administrator" is automatically also granted `board_chair` (platform scope) and `org_admin` (their organization's scope) — but the reverse isn't true: making someone an `org_admin` for one organization does **not** make them a platform Administrator.

Because of this, the table below maps each pilot role you asked to test to the **real system role(s)** behind it, and how to obtain that role in this build.

| Pilot Role | System Role(s) | How to Get This Role | Test Login | Can See | Can Do | Cannot Access |
|---|---|---|---|---|---|---|
| **Platform Super Admin** | Legacy `administrator` (auto-grants `board_chair`@platform + `org_admin`@your org) | Seeded, or created via Employees page by another Administrator | `admin@helpinghands.org` / `Admin@123456` | Everything: all organizations, all funds, all projects, audit log, workflow definitions, content/CMS, language settings | Create/verify/suspend organizations; manage platform staff (Employees page); manage funds and officers; open the Board workspace; edit CMS content and languages; view full audit log | Nothing is technically blocked for this role — it is the highest tier |
| **Board Member** | `board_member`@platform | ⚠️ **No self-service UI exists yet.** Currently only reachable via direct database seeding by the delivery team — see the warning banner at the top of this document | *(none seeded — request one from the dev team for testing)* | Board workspace: review queue, verification queue, report review queue, Board dashboard, decision history | Vote on studies/proposals in Board rounds; approve/reject/request-changes on studies, funding, and organization verification (with mandatory written rationale) | Cannot edit CMS content, manage platform employees, or change system settings — those remain Administrator-only |
| **Organization Admin** | `org_admin`@organization | Granted from the platform Organizations page (drawer → "Grant Role") or from the organization's own Team page by an existing `org_admin` | *(create via Organizations → your test org → Team, or self-register an org — see Section 3, Steps 1–2)* | Their own organization's workspace only: its projects, studies, donations, reports, team, settings | Create projects, invite/manage team members and their roles, submit reports, edit org settings (name/registration number) | Cannot see or act on **any other organization's** data (enforced server-side — attempting to open another org's project by ID returns "not found," not "forbidden"); cannot activate/suspend their own organization or grant Board/platform roles |
| **Project Manager** | `project_manager`@organization or `project_lead`@project | Granted from the org's Team page (org-scope) or from a specific project's "Participations" panel (project-scope, useful for staff from a *partner* organization working on one shared project) | *(grant to a test user via Team page)* | Assigned organization's (or assigned project's) execution details: tasks, phases, milestones, budget/expenses | Create/update project tasks, phases, milestones; submit project-level financial entries (budgets/expenses) | Cannot grant roles to others; cannot approve fund allocations or Board decisions |
| **Staff Employee** | Legacy `employee` (platform-wide) **or** `staff`@organization (day-to-day org work) | Legacy: seeded/created via Employees page. Org-scoped: granted via the org's Team page | `employee@helpinghands.org` / `Employee@123` | Platform Dashboard, Donations, Projects, Studies, Participants, and Content pages (no Organizations/Funds/Workflow/Audit — those are Administrator-only) | Approve/reject cash donations (QR verification), edit projects/studies, manage CMS content | Cannot see the Organizations, Funds, Workflow, or Audit sections of the sidebar at all |
| **Accountant** | Legacy `financial_officer` (platform/project-level reports) **or** `org_accountant`@organization **or** `fund_accountant`@fund | Legacy: seeded/created via Employees page. Scoped versions: via Team page or a Fund's officer list | `officer@helpinghands.org` / `Officer@123` | Financial reports, donations, project budgets/expenses/transactions for projects they're linked to; fund balances if also a fund officer | Approve/reject donations; manage a project's budget, expenses, and transactions; download financial exports | Cannot access Organizations, Workflow, or Audit; cannot verify/activate organizations or make Board decisions |
| **Viewer** | `viewer`@organization | Granted via the org's Team page | *(grant to a test user via Team page)* | Read-only access to their organization's workspace (projects, studies, donations, reports) | Nothing — this role is deliberately read-only | Cannot create, edit, approve, or submit anything |
| **Public Donor** | `participant` (public referenceType) | Self-register at the public website (`/auth/register`) — no approval needed | `participant@example.com` / `Participant@123` | Public project listings, the Transparency Portal, their own donation/voting history dashboard | Donate (cash-with-QR or online by card); vote on published studies; browse the Transparency Portal | Cannot see draft/unpublished studies, any admin screen, other donors' data, or any single organization's internal workspace |

---

## 3. Full Real-Life Scenario

**Scenario:** *The Municipality of Al‑Karama wants to build a water network expansion, partially funded by a partner NGO and by public donations.*

Follow these steps in order — each one names the exact screen and buttons to use.

### Step 1 — Platform admin creates/verifies the municipality

1. Log into the **admin app** (`http://localhost:3001/login`) as `admin@helpinghands.org`.
2. Two ways to bring Al‑Karama Municipality onto the platform:
   - **Self-service:** the municipality's contact person visits the admin app's public **Register Organization** page (`/register`) and submits their organization as type `municipality` with a registration number and contact details. *(Note: this page is feature-flag gated to an allowlist for the pilot — confirm with the delivery team that self-registration is enabled before testing this path.)*
   - **Direct creation:** as Administrator, go to **Organizations** in the sidebar and create the organization directly.
3. Either way, the new organization starts in **`pending_verification`** status.
4. As Administrator (acting as Board Chair), open **Organizations**, find "Al‑Karama Municipality," and run it through verification: **begin review → verify → activate**. Its status becomes **`active`**.
5. While reviewing, confirm/set its **capabilities**: `canExecuteProjects: true`, `canReceivePublicFunds: true`, `isGovernmentEntity: true`, `requiresBoardOversight: true` (this last flag is what will add an extra Board review hop to this municipality's projects later).
6. From the Organizations page, invite the municipality's first user as **`org_admin`** (either directly with credentials, or via an activation-link invite — see the SMTP warning at the top of this document if the invite email doesn't arrive).

### Step 2 — Municipality admin enters the workspace

1. The invited user logs into the admin app and lands in the **Organization Workspace** (`/org/dashboard`) — a separate, scoped view from the platform dashboard, showing only Al‑Karama Municipality's own numbers (its projects, donations, collected amount, open votes).
2. The workspace sidebar shows only: Dashboard, Projects, Studies, Donations, Reports, Team, Settings — no Organizations/Funds/Audit, since this is an organization-scoped login, not a platform one.

### Step 3 — Create the project

1. From `/org/dashboard`, click **"New Project"** (or go to `/org/projects` → **New Project**).
2. Fill in:
   - **Name:** `Al‑Karama Water Network Expansion`
   - **Category:** e.g. "Infrastructure" (chosen from the project category list)
   - **Responsible/Owner Organization:** Al‑Karama Municipality (auto-filled — you're creating it from inside that org's workspace)
   - **Fund of record:** select an existing active fund, e.g. "Municipal Infrastructure Fund" (this is the project's `primaryFundId` — the fund most closely tied to this project, distinct from any additional funds that later contribute)
   - **Participating organizations:** add a partner NGO, e.g. "Clean Water Alliance," with a participation role such as **`funding_partner`** or **`executing_agency`** (managed from the project detail page's Participations panel)
3. Save. The project appears in `/org/projects` with `progress: 0%`.

### Step 4 — Create the project study

1. Open the new project and go to its **Studies** tab (or `/org/studies` → link the project).
2. Fill in the study sections:
   - **Problem:** description of the water shortage
   - **Objectives:** what the expansion will achieve
   - **Budget:** the full cost breakdown
   - **Timeline:** milestones/dates
   - **Documents:** upload supporting files (images, video, or PDF are all supported)
3. Move the study's status from **draft → in review**, then **publish** it so the public can see and vote on it.

### Step 5 — Board review

1. Log in as a user with a Board seat (Board Chair, e.g. `admin@helpinghands.org`) and open **Board** in the platform sidebar → **Queue** tab.
2. Find the Al‑Karama study/project entry. The Board can:
   - **Review** the submitted study and documents
   - **Approve** it (moves the study to `approved`, unlocking the funding step)
   - **Request changes** (sends it back with mandatory written feedback — the municipality must revise and resubmit)
3. Every decision requires a **written rationale** and is permanently recorded (visible later in Board **History** and on the public Transparency Portal's decision history for this project).

### Step 6 — Funding

1. Still as a Board/Fund officer, go to **Funds** in the platform sidebar, open "Municipal Infrastructure Fund."
2. **Propose an allocation** to the Al‑Karama project (status starts as `proposed`).
3. The **Board decides**: approve → the allocation becomes `board_approved`.
4. **Disbursement:** release the money in tranches; each tranche moves the allocation to `disbursing` and posts a matching debit/credit pair on the fund's and project's ledger accounts (this is a real double-entry ledger — every transaction is traceable and, once posted, is never edited, only reversed by a correcting entry).
5. Once all tranches are paid and confirmed, mark the allocation **`reconciled`**, then **`closed`**.
6. If at any point the fund is **frozen** (see Section 7), no *new* allocations or disbursements can be proposed against it — but this does not hide or alter anything already recorded.

### Step 7 — Execution

1. Back in the project's workspace, open its **Execution** tab: break the work into **Tasks**, **Phases**, and **Milestones**, and update their status as work progresses (pending → in progress → completed).
2. Record **Expenses** against the project's budget as money is actually spent (each expense goes through its own pending → approved/rejected step).
3. The municipality submits **Reports** (progress and/or financial) from `/org/reports`, either ad hoc or against the funding agreement's schedule. The Board reviews each one: **accept** or **return** (returned reports must be revised and resubmitted; if a funding agreement is configured to block disbursement on overdue reports, further money won't move until the report is submitted).

### Step 8 — Transparency

Anyone — no login required — can visit the public **Transparency Portal** (`/transparency`) and drill into this project to see:
- **Where the money came from:** intake broken down by channel (cash/QR donations, online donations to the project, online donations to the fund)
- **Which fund paid:** the fund's allocation and disbursement history for this project
- **Who approved:** the full Board decision history for this project (approvals, rejections, requested changes — each with its rationale and timestamp)
- **Progress status:** the same live progress bar and completion percentage shown in the admin app, automatically recalculated every time a donation is approved or a fund tranche is disbursed

---

## 4. Admin Testing Checklist

> Log in as `admin@helpinghands.org` unless a step says otherwise.

**Login**
- [ ] Log in with valid credentials → redirected to `/dashboard`
- [ ] Log in with wrong password → clear error shown, not logged in
- [ ] Log out → redirected to login, protected pages no longer reachable without logging back in

**Organizations**
- [ ] View the Organizations list (name, type, status, member count, project count)
- [ ] Create or receive a self-registered organization in `pending_verification`
- [ ] Run it through begin-review → verify → activate; status updates correctly
- [ ] Suspend an active organization; confirm its users lose access to write actions
- [ ] Open an organization's capability flags and toggle one; confirm it takes effect (e.g. toggling `canExecuteProjects` off should block that org from creating new projects)
- [ ] Use "Open Workspace" to jump into an organization's `/org/dashboard` as platform admin

**Users**
- [ ] Create a new platform employee (Employees page) with each legacy role: administrator, employee, financial_officer
- [ ] Edit an existing employee's role and confirm their sidebar changes on next login
- [ ] Deactivate a user; confirm they can no longer log in
- [ ] Invite a new organization team member from an org's Team page; confirm the invite/activation flow (note the SMTP caveat at the top of this document)

**Permissions**
- [ ] Confirm an `employee` login does **not** see Organizations, Funds, Workflow, or Audit in the sidebar
- [ ] Confirm a `financial_officer` login can see Reports and Donations but not Organizations
- [ ] Confirm an org-scoped `org_admin` cannot open a different organization's project by guessing/pasting its URL (should behave as "not found")
- [ ] Confirm only Board roles can approve/reject a study or fund allocation, even if a platform Administrator tries to bypass by URL

**Funds**
- [ ] View a fund's balance, intake, allocated, and disbursed totals
- [ ] Propose an allocation, approve it as Board, disburse a tranche, reconcile, and close it — confirm each stage is reflected on the fund's ledger
- [ ] Freeze a fund; confirm new allocation/disbursement actions are blocked while existing history remains visible
- [ ] Reactivate the fund; confirm actions resume
- [ ] Export a fund's CSV statement

**Projects**
- [ ] Create a project with category, owning organization, fund of record, and at least one participating organization
- [ ] Edit and delete a project
- [ ] Confirm progress % updates automatically after a donation is approved

**Workflow**
- [ ] Open the Workflow page and view the `project-lifecycle` definition's states and transitions
- [ ] Confirm a municipality-type project (with `requiresBoardOversight`) shows the extra Board-review step in its lifecycle, while a standard NGO project does not

**Reports**
- [ ] Generate a project PDF report (summary/financial/progress) and an Excel export (financial/donations/expenses)
- [ ] Review a submitted org report from the Board queue: accept one, return another with feedback

**Audit logs**
- [ ] Open the Audit page (Administrator only) and confirm recent actions (e.g. the project you just created) appear with actor, action, before/after values, and timestamp
- [ ] Confirm audit entries cannot be edited or deleted through any UI

**Translations**
- [ ] Switch the admin app language (English/Arabic/French) and confirm labels, table headers, and form fields translate correctly on at least 3 different pages
- [ ] Confirm no raw translation keys (e.g. `donations.title`) are visible anywhere

**RTL**
- [ ] Switch to Arabic and confirm the entire layout mirrors correctly (sidebar on the right, text right-aligned, icons flipped where directional)
- [ ] Confirm forms, tables, and modals remain usable and correctly aligned in RTL

**Exports**
- [ ] Export a donations CSV and confirm it opens correctly and matches the on-screen data
- [ ] Export a fund statement CSV
- [ ] Export a project financial/progress report (PDF and Excel)

---

## 5. Organization User Testing Checklist

> Log in as an `org_admin` (or invited team member) for your test organization.

- [ ] **Create project:** from `/org/projects`, create a new project with all required fields; confirm it only appears in your own organization's list, not the platform-wide admin's other-org views
- [ ] **Invite employee:** from `/org/team`, invite a new team member by email; confirm they receive (or, per the SMTP caveat, can be shown) an activation link
- [ ] **Assign roles:** grant the new member an org-scope role (`project_manager`, `staff`, `org_accountant`, or `viewer`); confirm their access matches that role after they log in
- [ ] **Upload documents:** attach at least one image, one video, and one PDF to a project study section; confirm all three preview/download correctly
- [ ] **Submit reports:** submit a progress report and a financial report from `/org/reports`; confirm they appear as `submitted` and later move to `under_review`/`accepted`/`returned` as the Board processes them
- [ ] **Manage tasks:** create tasks/phases/milestones under a project's Execution tab and move them through their status stages

---

## 6. Donor/Public Testing

> No login required for browsing; login as `participant@example.com` (or self-register a new account) for donating and voting.

- [ ] **Open transparency portal:** visit `/transparency` with no login and confirm it loads (platform totals, funds, project categories, organization directory)
- [ ] **View projects:** browse the public project list and open a project detail page; confirm progress bar, budget, and funding source information are visible
- [ ] **View funds:** open a fund's public detail page (`/transparency/funds/[id]`) and confirm intake/allocation/spend figures and CSV statement download work
- [ ] **Donate — cash:** log in as a donor, open a project with an approved (or no) study, choose "Donate → Cash," pick/enter an amount, and confirm a QR code and downloadable image are generated
  > **How staff actually verify this today:** the admin/org "Donations" page has a **"Scan QR"** button, but it opens a text box, not a camera. Staff paste or type the token (or the full donation URL — pasting the URL auto-extracts the token) printed under the QR code, then look it up and click Approve/Reject. Do **not** test this by holding the printed QR up to a webcam — that is not how it works in this build. If your pilot needs true camera-based scanning, raise it as a feature request, not a bug.
- [ ] **Donate — online:** *(treat as a UI-only test unless real payment keys are confirmed — see the warning at the top of this document)* choose "Donate → Online," pick a currency/amount, and confirm you're redirected to a Stripe/PayPal checkout page
- [ ] **Check money trail:** after a cash donation is approved by staff, revisit the project's transparency page and confirm the new amount is reflected in its funding total and progress bar within the portal's refresh window
- [ ] **Donor history:** from the donor's own dashboard, confirm the new donation appears with the correct status (pending until staff approves it, then approved)

---

## 7. Failure Cases

These are **expected, correct** behaviors — if the system does something different from what's described here, that's a real bug to report.

| Scenario | Expected behavior |
|---|---|
| **User without permission** tries an action their role doesn't allow (e.g. a `viewer` tries to submit a report) | The action is rejected (HTTP 403 / a clear "not authorized" message in the UI); nothing is created, changed, or deleted |
| **Wrong organization access** — a user from Organization A tries to open Organization B's project/report/donation by guessing or pasting its URL/ID | Treated as if it doesn't exist (404-style "not found"), not as a "forbidden" error — this is deliberate, so users can't even confirm another organization's data exists |
| **Missing approval** — someone tries to move a project into execution or release fund money before the required Board approval has happened | The action is blocked by the workflow engine; the project/allocation stays in its current stage until the approval step is actually completed |
| **Missing report** — an organization is overdue on a required progress or financial report, and its funding agreement is configured to block disbursement on overdue reports | Further fund disbursement to that organization is held until the report is submitted and accepted; existing/past disbursements are unaffected |
| **Frozen fund** — someone tries to propose a new allocation or disburse a tranche from a fund that's currently `frozen` | The action is blocked; the fund's existing balance, past allocations, and ledger history remain fully visible and untouched |
| **Invalid donation** — someone submits a QR/donation token that doesn't exist, has already been approved, or has been cancelled, or a staff member tries to approve/reject a donation that isn't `pending` | The lookup or status-change request is rejected with a clear error; no duplicate approval or double-counting toward the project's progress can occur |

---

## 8. Final Pilot Acceptance Checklist

Before signing off on the pilot, confirm each of the following explicitly — do not assume any of these are done just because the feature "works" in a demo.

- [ ] **Security checked** — All default passwords, JWT secrets, and database credentials have been rotated away from development defaults; the site is served over HTTPS/TLS (not plain HTTP), since login tokens are stored in the browser; login and password-reset endpoints have rate limiting enabled
- [ ] **Permissions checked** — Every role in Section 2 has been tested logged-in, not just assumed from this document; cross-organization isolation has been manually verified (an org user genuinely cannot reach another org's data); a plan exists for granting Board Member/Secretary/Auditor seats (currently no self-service UI — coordinate with the delivery team)
- [ ] **Translations checked** — All three languages (English/Arabic/French) reviewed on every screen the pilot users will actually use, including RTL layout for Arabic
- [ ] **Financial reconciliation checked** — At least one full allocation cycle (propose → Board-approve → disburse → reconcile → close) has been run end-to-end and its ledger entries manually verified against the fund and project totals shown in the UI
- [ ] **Transparency checked** — The Board has reviewed and explicitly approved which data fields are public via the publication policy settings, before any real financial or project data goes live on the public Transparency Portal
- [ ] **Backup tested** — A database backup has been taken and a restore has actually been rehearsed (not just scheduled) in a non-production environment
- [ ] **Email delivery confirmed** — SMTP is configured and a real invitation and password-reset email have been received end-to-end (required for organization onboarding to work in production, where the on-screen fallback link is disabled)
- [ ] **Payment credentials confirmed** — If online donations are part of the pilot, real Stripe/PayPal keys (not the placeholder test keys) have been installed and a real small-value transaction has been completed and verified in the ledger
