# Admin Acceptance Test — Release QA Checklist

> **Audience:** QA team, project managers, pilot sponsors, auditors.
> **Purpose:** the final release acceptance checklist. Every implemented feature is covered; nothing here is aspirational. Print this document (or track it in your test-management tool) and tick each box during a full regression pass before any pilot or production release.
> **Legend:** Pass/Fail = ☐ Pass ☐ Fail. Leave Notes blank until executed.
> **Default test accounts** (see `DEMO_DATA.md` for the complete list): `admin@helpinghands.org` / `Admin@123456` (Administrator + Board Chair), `employee@helpinghands.org` / `Employee@123`, `officer@helpinghands.org` / `Officer@123`, `participant@example.com` / `Participant@123`.

---

## How to use this document

Each test case has: **Prerequisites**, **Steps**, **Expected Result**, **Pass/Fail**, **Notes**. Section-level prerequisites apply to every test case in that section unless a test case states its own. Run sections top to bottom — later sections (Governance, Funds) depend on data created in earlier ones (Organizations, Projects).

---

## 1. Authentication & Sessions

*Section prerequisite: seeded database, API running at `http://localhost:4000`, admin app at `http://localhost:3001`.*

**TC-1.1 — Login succeeds**
Steps: 1) Go to `/login`. 2) Enter `admin@helpinghands.org` / `Admin@123456`. 3) Submit.
Expected Result: Redirected to `/dashboard` (Platform Workspace); JWT stored; user menu shows the account name.
Pass/Fail: ☐ | Notes:

**TC-1.2 — Invalid password rejected**
Steps: Enter correct email, wrong password.
Expected Result: Clear inline error; not logged in; no token stored.
Pass/Fail: ☐ | Notes:

**TC-1.3 — Logout works**
Steps: Log in, then click "Logout."
Expected Result: Redirected to `/login`; protected pages (`/dashboard`, `/org/dashboard`, `/board`) are no longer reachable without logging back in.
Pass/Fail: ☐ | Notes:

**TC-1.4 — Token refresh on expiry**
Prerequisites: `JWT_EXPIRES_IN` set short for testing, or wait out the default 15-minute access-token life.
Steps: Stay logged in past access-token expiry, then perform any action.
Expected Result: A silent `POST /auth/refresh` renews the session with no visible interruption; if the refresh token is also invalid/expired, the user is redirected to `/login`.
Pass/Fail: ☐ | Notes:

**TC-1.5 — Participant self-registration**
Steps: On the public site (`/auth/register`), submit first/last name, email, password meeting the complexity rule (upper+lower+digit+special, min 8), account type.
Expected Result: Account created, auto-logged-in, redirected to `/dashboard` on the public site.
Pass/Fail: ☐ | Notes:

**TC-1.6 — Brute-force / rate limiting on login**
Steps: Submit 6+ failed login attempts within one minute against the same account.
Expected Result: **Currently expected to FAIL this check** — `ThrottlerGuard` is not globally applied to `/auth/login` (tracked as BUG-2, open). Record as a known gap, not a new bug, but do not sign off pilot/production readiness until fixed — see `BACKUP_RECOVERY.md` §7 and `SYSTEM_ARCHITECTURE.md` §10.
Pass/Fail: ☐ | Notes:

**TC-1.7 — Change password**
Steps: Logged in, use "Change Password" with current + new password.
Expected Result: Password updates; subsequent logins require the new password; old sessions' refresh tokens are not force-invalidated (verify whether this matches your security requirements).
Pass/Fail: ☐ | Notes:

**TC-1.8 — Workspace context switch**
Prerequisites: Logged in as a user with both a platform grant and organization membership (e.g. `admin@helpinghands.org`).
Steps: Use "Switch Context" to enter the HelpingHands organization's workspace, then switch back.
Expected Result: `GET /auth/switch-context` issues a re-scoped token; the admin app navigates to `/org/dashboard` showing only that organization's data, then back to `/dashboard` on switching back.
Pass/Fail: ☐ | Notes:

**TC-1.9 — Participant profile self-edit (known gap)**
Prerequisites: Logged in as `participant@example.com` on the public site.
Steps: Go to `/dashboard/profile`, change the first/last name, save.
Expected Result: **Currently expected to FAIL this check** — `User.adminId`/`User.participantId` are never populated on account creation (BUG-7, open), so the owner-check inside the update logic fails even for the actual owner, and the save is rejected. Record as a known gap, not a new bug — see `SYSTEM_ARCHITECTURE.md` §10.
Pass/Fail: ☐ | Notes:

---

## 2. Permissions & Tenancy Isolation

*Section prerequisite: at least two organizations exist (see §3), each with at least one project.*

**TC-2.1 — Employee sidebar restrictions**
Prerequisites: Logged in as `employee@helpinghands.org`.
Expected Result: Sidebar shows Dashboard, Donations, Projects, Studies, Participants, Content — **not** Organizations, Funds, Workflow, Audit, or Employees.
Pass/Fail: ☐ | Notes:

**TC-2.2 — Financial officer restrictions**
Prerequisites: Logged in as `officer@helpinghands.org`.
Expected Result: Can see Reports and project Financial pages but not Organizations, Funds (management), Workflow, or Audit.
Pass/Fail: ☐ | Notes:

**TC-2.3 — Cross-organization data isolation (id-guessing)**
Prerequisites: Logged in as an `org_admin` of Organization A; know or guess a project id belonging to Organization B.
Steps: Navigate directly to `/org/projects/{B's-project-id}`.
Expected Result: Treated as **not found** (404-style), never as "forbidden" — so a user cannot even confirm another organization's data exists.
Pass/Fail: ☐ | Notes:

**TC-2.4 — Cross-organization list isolation**
Prerequisites: Same as TC-2.3.
Steps: View `/org/projects`, `/org/donations`, `/org/studies`, `/org/reports` as Organization A's admin.
Expected Result: Only Organization A's rows ever appear, regardless of total record count on the platform.
Pass/Fail: ☐ | Notes:

**TC-2.5 — Board cross-organization read (audited bypass)**
Prerequisites: Logged in as a Board seat holder (e.g. `admin@helpinghands.org`).
Steps: Open the Board Queue/Projects tab; confirm items from multiple organizations appear.
Expected Result: Cross-org data is visible; an `audit` entry records the tenancy bypass (verify in `/audit`, action `tenancy.bypassed`).
Pass/Fail: ☐ | Notes:

**TC-2.6 — Board cannot write into org data directly**
Steps: As a Board user inside another org's workspace (via switch-context), attempt to directly edit a project field outside of a governed action (decision/allocation/verification).
Expected Result: Board acts only through decisions, vote rounds, capability changes, and fund/organization status changes — not ad hoc edits. (Manually confirm no unexpected write surface exists.)
Pass/Fail: ☐ | Notes:

**TC-2.7 — Participant cannot reach admin surfaces**
Prerequisites: Logged in as `participant@example.com` on the admin app's API directly (or via browser dev tools).
Steps: Call `GET /organizations`, `GET /funds`, `GET /audit`, `GET /dashboard/stats`.
Expected Result: 403/401 on every one of these; participants only ever see their own donation/vote history via participant-scoped endpoints.
Pass/Fail: ☐ | Notes:

---

## 3. Organizations

*Section prerequisite: Administrator login.*

**TC-3.1 — Create organization directly**
Steps: `/organizations` → "Create Organization" → fill type (`ngo`/`municipality`/`youth_team`/`initiative`), name, registration number.
Expected Result: Created in `pending_verification` status.
Pass/Fail: ☐ | Notes:

**TC-3.2 — Self-service organization registration (flag-gated)**
Prerequisites: `ORG_SELF_REGISTRATION` set to `allowlist` or `open`; if `allowlist`, the test email must be in `ORG_REGISTRATION_ALLOWLIST`.
Steps: On the admin app's public `/register` page, submit an org of type `municipality` or `youth_team` with an admin contact.
Expected Result: If gated closed (`off`) or the email isn't allow-listed, registration is rejected with a clear message. If allowed, org is created `pending_verification` and the submitting user becomes its first `org_admin` upon activation.
Pass/Fail: ☐ | Notes:

**TC-3.3 — Verify organization (full lifecycle)**
Prerequisites: An org in `pending_verification` with registration documents uploaded.
Steps: Board → Verifications tab → Begin Review → Verify → Activate.
Expected Result: Status moves `pending_verification → under_review → verified → active`; "Verify" is blocked until documents are on file (`documents_present` guard).
Pass/Fail: ☐ | Notes:

**TC-3.4 — Reject organization verification**
Steps: From `under_review`, click Reject.
Expected Result: Status → `rejected`; org cannot execute projects or receive funds.
Pass/Fail: ☐ | Notes:

**TC-3.5 — Toggle capabilities**
Steps: Open an active org's capability flags; toggle `canExecuteProjects` off; attempt to create a project as that org's `org_admin`.
Expected Result: Project creation is blocked while the capability is off; toggling it back on restores the ability immediately.
Pass/Fail: ☐ | Notes:

**TC-3.6 — Suspend / reactivate organization**
Steps: Suspend an active org; confirm its users' write actions; reactivate.
Expected Result: Suspended org's users lose write access (read remains); reactivation restores it.
Pass/Fail: ☐ | Notes:

**TC-3.7 — Invite and manage organization members**
Steps: From Organizations (platform) or `/org/team` (org-scoped), invite a new member by email; assign a role (`org_admin`/`project_manager`/`staff`/`org_accountant`/`viewer`); confirm activation flow.
Expected Result: Invited user receives (or, absent working SMTP, is shown) an activation link; upon activation lands in that org's workspace with the assigned role's permissions.
Pass/Fail: ☐ | Notes:

**TC-3.8 — Open Workspace (platform admin enters an org)**
Steps: From `/organizations`, click "Open Workspace" for any active org.
Expected Result: Lands in that org's `/org/dashboard` via an audited switch-context, with full visibility.
Pass/Fail: ☐ | Notes:

---

## 4. Projects

*Section prerequisite: at least one active organization.*

**TC-4.1 — Create project**
Steps: `/projects/new` (or `/org/projects/new`): name (en/ar/fr), category, owning org, fund of record (optional unless `PROJECT_FUND_REQUIRED=true`), target value, location, expected start date.
Expected Result: Created, appears in the list and on the public website immediately.
Pass/Fail: ☐ | Notes:

**TC-4.2 — Edit project**
Steps: Open a project, edit fields, save.
Expected Result: Changes persist and reflect on the public page.
Pass/Fail: ☐ | Notes:

**TC-4.3 — Delete project**
Prerequisites: Administrator only.
Steps: Delete a project with no donations/allocations against it.
Expected Result: Removed from all lists; confirm behavior against a project *with* existing donations (should be restricted — verify actual behavior and record it).
Pass/Fail: ☐ | Notes:

**TC-4.4 — Assign financial officer**
Steps: Administrator assigns a `financial_officer` to a project.
Expected Result: That officer's donation/report views scope to their assigned project(s) going forward.
Pass/Fail: ☐ | Notes:

**TC-4.5 — Joint project participation**
Steps: On a project's Participations panel, add a partner organization with role `funding_partner` or `executing_agency`.
Expected Result: Partner org's relevant staff (with a project-scope grant) can access exactly this one project from their own workspace — no other project of the owning org is exposed.
Pass/Fail: ☐ | Notes:

**TC-4.6 — Progress auto-recalculation**
Steps: Approve a cash donation against a project; note progress % before/after.
Expected Result: Progress recalculates automatically and immediately; no manual "recalculate" action needed.
Pass/Fail: ☐ | Notes:

---

## 5. Studies & Public Voting

**TC-5.1 — Create study and sections**
Steps: Create a study for a project; confirm department-template sections are suggested based on category.
Expected Result: Sections created in `pending` status, assignable to staff.
Pass/Fail: ☐ | Notes:

**TC-5.2 — Submit → publish (standard NGO lifecycle)**
Prerequisites: Owning org does **not** have `requiresBoardOversight`.
Steps: Move study `draft → in_review → published`.
Expected Result: Each transition only available when its guard is satisfied; study becomes publicly visible at `published`.
Pass/Fail: ☐ | Notes:

**TC-5.3 — Open and close public voting**
Steps: Open voting; as a participant, cast for/against/abstain votes; close voting.
Expected Result: One vote per user enforced; tally visible; closing requires the workflow's `vote_passed` guard (trivially satisfied under current default rules — tally only, no quorum).
Pass/Fail: ☐ | Notes:

**TC-5.4 — Approve / reject study**
Steps: From `voting_closed`, Approve (or Reject) with a mandatory Board rationale.
Expected Result: Status updates; a `BoardDecision` row is created; rejection reason is visible to the owning organization.
Pass/Fail: ☐ | Notes:

**TC-5.5 — Board-oversight lifecycle (municipality)**
Prerequisites: Owning org has `requiresBoardOversight: true`.
Steps: Move a study to `voting_closed`, then observe the next available action.
Expected Result: `send_to_board` (→ `board_review`) appears instead of direct approve/reject; no public voting is required for this path.
Pass/Fail: ☐ | Notes:

**TC-5.6 — Request changes / revision cycle**
Steps: From the review queue, "Request Changes" with a rationale.
Expected Result: Study returns to `draft`; rationale is visible to the owning organization; resubmission re-enters the same flow.
Pass/Fail: ☐ | Notes:

**TC-5.7 — Study by-id access restriction**
Steps: As a `participant`, call `GET /study/:id` directly for a draft/unpublished study.
Expected Result: 403 — confirms the BUG-8 fix (staff-only by-id route; public reads only via the published, redacted project route).
Pass/Fail: ☐ | Notes:

**TC-5.8 — Vote audit trail**
Steps: Open `/studies/[id]/votes`.
Expected Result: Every vote listed with choice/comment/timestamp; CSV export works; filter by choice works.
Pass/Fail: ☐ | Notes:

---

## 6. Governance / Board Decisions

**TC-6.1 — Decision requires rationale**
Steps: Attempt to submit a Board decision with an empty rationale field.
Expected Result: Blocked client- and server-side; rationale is mandatory.
Pass/Fail: ☐ | Notes:

**TC-6.2 — Decisions are immutable**
Steps: Attempt to find any edit/delete control for a decision in `/board` → History.
Expected Result: None exists; corrections must be new decisions.
Pass/Fail: ☐ | Notes:

**TC-6.3 — Only Board roles can decide, even by URL**
Prerequisites: Logged in as `employee@helpinghands.org` (platform staff, not a Board seat... note: in this seed, `administrator` auto-grants `board_chair`, so use a genuinely non-Board account for this test).
Steps: Attempt `POST /governance/decisions` directly.
Expected Result: 403 — a platform Administrator bypassing via direct API call is also blocked unless they hold the Board grant.
Pass/Fail: ☐ | Notes:

**TC-6.4 — Cross-organization review queue**
Steps: Confirm the Board Queue tab shows studies/projects from every organization, not just one.
Expected Result: Full cross-org visibility for Board users only.
Pass/Fail: ☐ | Notes:

---

## 7. Workflow Engine

**TC-7.1 — View workflow definitions**
Steps: `/workflow` as Administrator.
Expected Result: Lists `project-lifecycle` (v1 and v2), `emergency-relief`, `org-verification`, `fund-allocation` — states, transitions, and guards visible.
Pass/Fail: ☐ | Notes:

**TC-7.2 — v1 vs v2 lifecycle difference**
Steps: Compare a standard NGO project's workflow timeline against a `requiresBoardOversight` municipality project's.
Expected Result: Municipality project shows the extra `board_review` state; NGO project does not.
Pass/Fail: ☐ | Notes:

**TC-7.3 — Guarded actions hide, not error, when unavailable**
Steps: On a project's Workflow Timeline component, observe available action buttons at each state.
Expected Result: Only actions whose guards currently pass are shown as clickable; others show the guard's denial reason (per `availableTransitions`) rather than a raw error after clicking.
Pass/Fail: ☐ | Notes:

**TC-7.4 — Step log is append-only**
Steps: Perform several transitions on one project; inspect its `WorkflowStepLog` history (via the timeline or `/audit`).
Expected Result: Full, ordered, unedited history of every transition with actor and timestamp.
Pass/Fail: ☐ | Notes:

---

## 8. Donations — Cash (QR)

**TC-8.1 — Create a cash donation (donor side)**
Prerequisites: Project with `donations_open` status (or an approved study, per project's lifecycle).
Steps: As a participant, choose "Donate → Cash," enter an amount.
Expected Result: Donation created `pending`; QR code + downloadable image generated; token/URL visible.
Pass/Fail: ☐ | Notes:

**TC-8.2 — Staff "scan" (token lookup, not camera)**
Steps: In `/donations`, click "Scan QR," paste the token or full donation URL.
Expected Result: Donation looked up correctly either way (URL auto-extracts the token); **confirm this is a text box, not a live camera feed** — that is expected behavior, not a bug.
Pass/Fail: ☐ | Notes:

**TC-8.3 — Approve donation**
Steps: Approve the located pending donation.
Expected Result: Status → `approved`; project progress recalculates; a ledger entry posts; donor sees updated status; (email notification — see §16 SMTP caveat).
Pass/Fail: ☐ | Notes:

**TC-8.4 — Reject donation**
Steps: Reject a pending donation with a reason.
Expected Result: Status → `rejected`; no progress or ledger impact; reason visible to donor.
Pass/Fail: ☐ | Notes:

**TC-8.5 — Cannot re-approve/re-reject a decided donation**
Steps: Attempt to approve an already-approved or already-rejected donation.
Expected Result: Rejected with a clear error; no duplicate ledger posting; no double-counting toward progress.
Pass/Fail: ☐ | Notes:

**TC-8.6 — Participant cancels own pending donation**
Steps: As the donating participant, cancel a still-pending donation.
Expected Result: Status → `cancelled`; staff can no longer approve/reject it.
Pass/Fail: ☐ | Notes:

**TC-8.7 — Financial-officer project-scope check**
Prerequisites: Officer assigned to Project A only; a pending donation exists on Project B.
Steps: Attempt to approve Project B's donation as that officer.
Expected Result: Blocked (assignment enforced) — verify this actually holds; if not, it reflects a known limitation on this specific route (financial officers are scoped correctly for donations, per `donations.service`).
Pass/Fail: ☐ | Notes:

**TC-8.8 — Donation-approval email (known gap)**
Prerequisites: SMTP configured and working.
Steps: Approve a participant's cash donation; check whether an approval email is sent.
Expected Result: **Currently expected to FAIL this check** — `User.adminId`/`User.participantId` are never populated (BUG-7, open), so the approval handler's lookup of the participant's email silently comes back empty and no email is sent, regardless of SMTP working correctly. Record as a known gap, not a new bug.
Pass/Fail: ☐ | Notes:

---

## 9. Donations — Online (Stripe/PayPal)

> ⚠️ Unless your pilot's finance team has confirmed real Stripe/PayPal keys are installed (replacing the placeholder `sk_test_...` values), treat this section as a **UI walkthrough only**, not a real money-movement test.

**TC-9.1 — Checkout redirect**
Steps: "Donate → Online," choose amount/currency/provider.
Expected Result: Redirected to a hosted Stripe or PayPal checkout page.
Pass/Fail: ☐ | Notes:

**TC-9.2 — Success return**
Steps: Complete a test-mode payment.
Expected Result: Redirected to `/donations/success`; status polls until `completed`; ledger entry posts via the webhook handler.
Pass/Fail: ☐ | Notes:

**TC-9.3 — Cancel return**
Steps: Abandon checkout.
Expected Result: Redirected to `/donations/cancel`; donation remains `pending`/uncompleted; retry option offered.
Pass/Fail: ☐ | Notes:

**TC-9.4 — Webhook idempotency**
Steps: (Technical test) replay the same webhook payload twice.
Expected Result: No duplicate ledger posting — enforced by the `(referenceType, referenceId, event)` idempotency key.
Pass/Fail: ☐ | Notes:

**TC-9.5 — Invalid webhook signature**
Steps: Send a webhook with a bad signature.
Expected Result: Should return 400. **Known gap (BUG-4, open):** currently returns 500 instead. Record as a known issue, not a new bug.
Pass/Fail: ☐ | Notes:

---

## 10. Funds & Treasury

**TC-10.1 — Create fund**
Steps: `/funds` → Create Fund: name, purpose, policy (dual-approval threshold).
Expected Result: Created `active`; a treasury account auto-provisioned.
Pass/Fail: ☐ | Notes:

**TC-10.2 — Manage fund officers**
Steps: Add officers with each of the 5 roles (`fund_director`, `fund_deputy`, `fund_secretary`, `fund_accountant`, `fund_controller`).
Expected Result: Each role's permitted actions match `SYSTEM_ARCHITECTURE.md` §6 (controller = read + flag only, no approve/disburse).
Pass/Fail: ☐ | Notes:

**TC-10.3 — Full allocation lifecycle**
Steps: Propose an allocation → Board approves → disburse a tranche → reconcile → close.
Expected Result: Each stage transition succeeds only when its guard is met; ledger entries post on disbursement; fund and project dashboards reflect the change immediately.
Pass/Fail: ☐ | Notes:

**TC-10.4 — Dual-approval threshold enforcement**
Prerequisites: Fund policy `dualApprovalThreshold` set above 0.
Steps: Attempt to disburse an amount above the threshold with only one officer's approval.
Expected Result: Blocked pending a second officer or Board decision.
Pass/Fail: ☐ | Notes:

**TC-10.5 — Freeze / reactivate fund**
Steps: Freeze an active fund; attempt a new allocation; reactivate.
Expected Result: New allocation/disbursement blocked while frozen; existing history remains fully visible; actions resume after reactivation.
Pass/Fail: ☐ | Notes:

**TC-10.6 — Export fund CSV statement**
Steps: Download a fund's CSV statement (from admin and from the public Transparency Portal, if policy-published).
Expected Result: Valid RFC-4180 CSV; figures reconcile with the fund dashboard totals.
Pass/Fail: ☐ | Notes:

**TC-10.7 — Multi-fund financing of one project**
Steps: Allocate from two different funds to the same project.
Expected Result: Project's funding sources correctly show both funds; no double-counting.
Pass/Fail: ☐ | Notes:

**TC-10.8 — Ledger reconciliation report**
Steps: Administrator opens `/treasury` reconciliation view (or equivalent).
Expected Result: Legacy-journal-vs-ledger parity confirmed (relevant while `TREASURY_LEDGER_READS` migration is mid-flight).
Pass/Fail: ☐ | Notes:

---

## 11. Financial (Project Budgets/Expenses/Transactions)

**TC-11.1 — Create budget**
Steps: On a project's Financial tab, add a budget line (estimated amount).
Expected Result: Created; visible in the project's financial summary.
Pass/Fail: ☐ | Notes:

**TC-11.2 — Expense approval workflow**
Steps: Add an expense against a budget; approve it; then try rejecting an already-approved one.
Expected Result: `pending → approved/rejected`; cannot flip an already-decided expense.
Pass/Fail: ☐ | Notes:

**TC-11.3 — Manual transaction entry**
Steps: Add a manual transaction (income/expense/refund/adjustment).
Expected Result: Recorded; reflected in the project financial summary; if `TREASURY_LEDGER_READS=true`, summary reads from the ledger instead of this legacy journal — verify the two stay reconciled.
Pass/Fail: ☐ | Notes:

**TC-11.4 — Financial-officer cross-project access (known gap)**
Prerequisites: Officer assigned to Project A only.
Steps: Attempt to create/approve a budget or expense on Project B as that officer.
Expected Result: **Currently expected to succeed (this is a known gap, BUG-5, open)** — the Financial module does not yet enforce project assignment the way Donations does. Record status; do not treat as a new finding.
Pass/Fail: ☐ | Notes:

---

## 12. Execution (Tasks / Phases / Milestones)

**TC-12.1 — Create and progress a task**
Steps: Add a task; move it `pending → assigned → in_progress → completed`.
Expected Result: Status updates persist; assignment to a team member works.
Pass/Fail: ☐ | Notes:

**TC-12.2 — Phases containing tasks**
Steps: Create a phase, add tasks under it, track phase progress.
Expected Result: Phase progress reflects its tasks' state (verify actual aggregation behavior).
Pass/Fail: ☐ | Notes:

**TC-12.3 — Milestone target dates**
Steps: Add a milestone with a target date; mark it complete on time, and separately, mark one complete after its target date.
Expected Result: On-time and late completions both recorded; status distinguishes `completed` from `missed` where applicable.
Pass/Fail: ☐ | Notes:

---

## 13. Organization Reporting & Funding Agreements

**TC-13.1 — Create funding agreement**
Steps: Board creates a Funding Agreement between a fund and an organization: terms (`blockDisbursementsOnOverdueReports`, grace days), reporting schedule (frequency, report types).
Expected Result: Agreement created `draft`, then moves to `active` when signed.
Pass/Fail: ☐ | Notes:

**TC-13.2 — Submit progress/financial report**
Steps: From `/org/reports`, submit a progress report and a financial report.
Expected Result: Both appear `submitted`, then move to `under_review` when the Board begins review.
Pass/Fail: ☐ | Notes:

**TC-13.3 — Accept / return report**
Steps: Board accepts one report; returns another with a mandatory comment.
Expected Result: Accepted report closes out; returned report requires resubmission, comment visible to the submitting org.
Pass/Fail: ☐ | Notes:

**TC-13.4 — Overdue report blocks disbursement**
Prerequisites: Funding agreement with `blockDisbursementsOnOverdueReports: true`; a report now overdue per the schedule.
Steps: Attempt to disburse a new tranche of an allocation tied to this agreement.
Expected Result: Blocked until the overdue report is submitted and accepted; existing/past disbursements remain unaffected.
Pass/Fail: ☐ | Notes:

**TC-13.5 — Obligation calendar**
Steps: View `/org/reports`' upcoming/overdue obligations panel.
Expected Result: Correctly computed from the funding agreement's schedule, not manually maintained.
Pass/Fail: ☐ | Notes:

---

## 14. Categories Taxonomy

**TC-14.1 — Full tree loads publicly**
Steps: `GET /categories` (no auth).
Expected Result: Returns the full 21-node tree (see `DEMO_DATA.md`) with i18n names for en/ar/fr.
Pass/Fail: ☐ | Notes:

**TC-14.2 — Category picker in project/template forms**
Steps: Use the category picker when creating a project.
Expected Result: Full hierarchy selectable (parent and child nodes); selection persists correctly.
Pass/Fail: ☐ | Notes:

**TC-14.3 — Legacy category values still resolve**
Steps: Inspect a pre-Wave-6 project seeded with a legacy `ProjectCategory` enum value (e.g. `agricultural`).
Expected Result: Correctly resolved to its matching taxonomy node; legacy column itself is frozen (never written by new code).
Pass/Fail: ☐ | Notes:

---

## 15. Transparency Portal & Publication Policy

**TC-15.1 — Public hub loads with no login**
Steps: Visit `/transparency` in a fresh/incognito browser session.
Expected Result: Loads platform stats, funds overview, org directory — no auth prompt.
Pass/Fail: ☐ | Notes:

**TC-15.2 — Fund and organization detail pages**
Steps: Visit `/transparency/funds/[id]` and `/transparency/organizations/[id]`.
Expected Result: Figures match the internal admin dashboard for the same fund/org; CSV download works on the fund page.
Pass/Fail: ☐ | Notes:

**TC-15.3 — Project money trail**
Steps: Open any published project's detail page on the public site.
Expected Result: Money trail section shows intake by channel, funding sources, spend by category, Board decision history, and an "as of" freshness timestamp.
Pass/Fail: ☐ | Notes:

**TC-15.4 — Refresh after new activity**
Steps: Approve a new cash donation on a project, then revisit its public page.
Expected Result: New amount reflected within the portal's refresh window (60-second cache TTL, or immediately via event-driven invalidation).
Pass/Fail: ☐ | Notes:

**TC-15.5 — Donor and beneficiary privacy (hard-excluded)**
Steps: Inspect every public transparency response for donor names/emails or beneficiary personal data, especially on social-support-category projects.
Expected Result: Never present, regardless of publication policy settings — this is enforced at the query level, not merely policy-gated.
Pass/Fail: ☐ | Notes:

**TC-15.6 — Publication policy gates a field class closed**
Prerequisites: A field class (e.g. `fund.allocations`) set to `workspace_only` or `never_public` via `PATCH /transparency-policy/:fieldClass`.
Steps: Request the corresponding public endpoint.
Expected Result: That data is withheld/403'd on the public surface while remaining visible internally (unless `never_public`, which is withheld everywhere non-workspace).
Pass/Fail: ☐ | Notes:

**TC-15.7 — Rate limiting on public surface**
Steps: Burst-request a public transparency endpoint beyond 20 req/s.
Expected Result: Throttled (429) beyond the configured burst/sustained limits; internal admin endpoints unaffected.
Pass/Fail: ☐ | Notes:

---

## 16. Content / CMS (Blogs, News, Events, About)

**TC-16.1 — Create/edit/delete each content type**
Steps: For each of Blogs, News, Events, About: create with EN/AR/FR translations, edit, delete.
Expected Result: Slug auto-generates and is unique; published items appear on the public site in the languages filled in; deletion removes from all lists.
Pass/Fail: ☐ | Notes:

**TC-16.2 — Image upload constraint (create vs. edit mode)**
Steps: Attempt drag-and-drop image upload while creating new content (before saving).
Expected Result: Not available in create mode (File rows FK to an existing Block) — only a URL text field is offered; drag-and-drop becomes available after the item is saved once (edit mode).
Pass/Fail: ☐ | Notes:

---

## 17. Languages (content i18n) & Admin UI i18n/RTL

**TC-17.1 — Content language registry**
Steps: `/languages` → add a language; confirm a new translation tab appears on content forms; remove it; confirm the tab disappears but existing translations aren't deleted.
Expected Result: As described.
Pass/Fail: ☐ | Notes:

**TC-17.2 — Admin UI language switch**
Steps: Use the header language `<select>` to switch English → Arabic → French across at least 5 different pages (Dashboard, Projects, Studies, Organizations, Board).
Expected Result: Labels, table headers, and form fields translate; no raw translation keys (e.g. `donations.title`) visible anywhere.
Pass/Fail: ☐ | Notes:

**TC-17.3 — RTL layout correctness**
Steps: Switch to Arabic; inspect layout mirroring.
Expected Result: Sidebar on the right, text right-aligned, directional icons flipped; forms/tables/modals remain usable and correctly aligned.
Pass/Fail: ☐ | Notes:

**TC-17.4 — Known gap: rich text editor toolbar**
Steps: Open the rich text editor (used in CMS content and study sections) under Arabic or French UI locale.
Expected Result: **Toolbar tooltips remain hardcoded English** (Bold, Italic, Underline, etc.) — this is a known, minor, un-fixed gap. Record but do not treat as new.
Pass/Fail: ☐ | Notes:

**TC-17.5 — Public website i18n**
Steps: Browse the public site in all three locales; confirm URL prefix behavior (`en` has no prefix by default, `/ar/...` and `/fr/...` are explicit).
Expected Result: Full translation coverage confirmed on Home, Projects, Transparency, Auth, Dashboard.
Pass/Fail: ☐ | Notes:

---

## 18. Employees & Participants Management

**TC-18.1 — Create employee with each role**
Steps: `/employees` → create one account per role: `administrator`, `employee`, `financial_officer`.
Expected Result: Each logs in and sees the sidebar appropriate to their role.
Pass/Fail: ☐ | Notes:

**TC-18.2 — Deactivate employee**
Steps: Toggle an employee inactive.
Expected Result: Cannot log in; existing sessions should also be rejected on next request (verify).
Pass/Fail: ☐ | Notes:

**TC-18.3 — Edit employee (known gap)**
Steps: Attempt to change an existing employee's name/email/password from `/employees`.
Expected Result: **NOT IMPLEMENTED** per current admin app — only Create + Toggle Active exist; no edit form. Record as a known gap.
Pass/Fail: ☐ | Notes:

**TC-18.4 — Participant self-scope enforcement**
Steps: As `participant@example.com`, call `GET /participants/{another-participant-id}`.
Expected Result: 404 (self-scope enforced — confirms the BUG-11 fix); own profile read succeeds.
Pass/Fail: ☐ | Notes:

**TC-18.5 — Toggle participant active**
Steps: Deactivate a participant from `/participants`.
Expected Result: Cannot log in; historical donations remain visible to staff.
Pass/Fail: ☐ | Notes:

---

## 19. Audit Log

**TC-19.1 — Mutating actions appear in audit**
Steps: Create a project, then open `/audit`.
Expected Result: The action appears with actor, action name, before/after snapshot, and timestamp within moments.
Pass/Fail: ☐ | Notes:

**TC-19.2 — Audit entries are immutable**
Steps: Search the UI and API for any edit/delete affordance on audit rows.
Expected Result: None exists.
Pass/Fail: ☐ | Notes:

**TC-19.3 — Denials are also audited for sensitive actions**
Steps: Attempt a sensitive action you're not authorized for (e.g. approve a fund allocation as `employee`).
Expected Result: Denial is itself recorded in the audit trail for sensitive/`POLICY_REGISTRY`-flagged actions.
Pass/Fail: ☐ | Notes:

---

## 20. Reports (PDF/Excel Exports)

**TC-20.1 — Generate each report type**
Steps: `/reports` → select a project → generate PDF Summary, PDF Financial, PDF Progress, Excel Financial, Excel Donations, Excel Expenses.
Expected Result: Each downloads correctly with current data; PDFs render cleanly; Excel files open without corruption warnings.
Pass/Fail: ☐ | Notes:

---

## 21. Notifications

**TC-21.1 — In-app notification on donation approval**
Steps: Approve a participant's donation.
Expected Result: An in-app notification appears in that participant's bell/inbox.
Pass/Fail: ☐ | Notes:

**TC-21.2 — Email notification (SMTP-dependent)**
Prerequisites: SMTP configured with working credentials (not the `.env.example` placeholder).
Steps: Same as TC-21.1.
Expected Result: An email is actually delivered. **If SMTP is not configured, no email will send** — this is expected in a dev/pilot-test environment, not a bug, provided a fallback (visible link/token) is shown on-screen. **Even with SMTP working, this specific email is currently expected to still not send** — see TC-8.8 (BUG-7): the participant's email lookup silently comes back empty, independent of SMTP.
Pass/Fail: ☐ | Notes:

**TC-21.3 — Mark read / mark all read**
Steps: Use the notification bell's mark-read and mark-all-read actions.
Expected Result: Unread count updates correctly and immediately.
Pass/Fail: ☐ | Notes:

---

## 22. Final Release Sign-off Checklist

Do not sign off a pilot or production release until every item below is explicitly confirmed — not merely assumed because a demo "worked."

- ☐ **Security** — default JWT secrets, DB password, and SMTP credentials rotated away from `.env.example` placeholders; site served over HTTPS/TLS (tokens live in `localStorage`); auth rate limiting enabled (BUG-2 fixed or mitigated at the ingress layer).
- ☐ **Permissions** — every role in `USER_MANUAL.md` tested while actually logged in as that role, not assumed; cross-organization isolation manually verified (§2 above, in full).
- ☐ **Translations** — all three languages reviewed on every screen the pilot's users will actually use, including Arabic RTL.
- ☐ **Financial reconciliation** — at least one full allocation cycle (propose → approve → disburse → reconcile → close) run end-to-end with ledger entries manually verified against fund/project totals shown in the UI.
- ☐ **Transparency** — the Board has reviewed and explicitly approved the publication policy (§15.6) before any real financial/project data goes live on the public portal.
- ☐ **Backup** — a database backup has been taken **and a restore actually rehearsed** in a non-production environment (see `BACKUP_RECOVERY.md`).
- ☐ **Email delivery** — SMTP confirmed working end-to-end with a real invitation and password-reset email received (required for organization onboarding and password reset to function in production).
- ☐ **Payment credentials** — if online donations are in scope, real Stripe/PayPal keys installed and a real small-value transaction completed and verified in the ledger.
- ☐ **Known open bugs reviewed** — BUG-2 (auth rate limiting), BUG-4 (webhook signature error code), BUG-5 (financial-officer project scoping), and the employee-edit gap (§18.3) are all either accepted as-is for this release or scheduled for a fix before go-live.

---

## Related documents
- `USER_MANUAL.md` — what each screen and button is supposed to do (the "why" behind each test case above).
- `DEMO_DATA.md` — the concrete seed data these test cases assume.
- `BACKUP_RECOVERY.md` — the backup/restore rehearsal referenced in §22.
