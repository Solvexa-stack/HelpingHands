# User Stories

## Roles

| Role | Who |
|------|-----|
| **Visitor** | Any unauthenticated person browsing the website |
| **Participant** | Registered donor |
| **Employee** | Staff member managing content and scanning QR codes |
| **Financial Officer** | Staff member responsible for approving donations on assigned projects |
| **Administrator** | Full-access staff member |

---

## Visitor

### US-01 — Browse Projects
**As a** visitor,  
**I want to** browse all active fundraising projects,  
**so that** I can find a cause I want to support.

**Acceptance criteria:**
- Projects are listed with cover image, title, goal amount, and progression percentage.
- I can filter by category (agricultural / industrial / trading).
- I can filter by location.
- I can search by project name.
- Projects are paginated.

---

### US-02 — View Project Details
**As a** visitor,  
**I want to** open a project's detail page,  
**so that** I can read the full description, see images, and understand the funding status.

**Acceptance criteria:**
- Page shows title, description, funding goal, current progression, location, and category.
- A "Donate" button is visible and prompts me to log in if I am not authenticated.

---

### US-03 — Read Content (Blogs / News / Events)
**As a** visitor,  
**I want to** read blog posts, news articles, and events,  
**so that** I can stay informed about the organization's activities.

**Acceptance criteria:**
- Each content type has its own listing page with cards.
- I can open a detail page for any item.
- Content respects my selected language (en / ar / fr).

---

### US-04 — Switch Language
**As a** visitor,  
**I want to** switch the website language between English, Arabic, and French,  
**so that** I can read content in my preferred language.

**Acceptance criteria:**
- A language picker is visible in the navbar.
- Switching language reloads the current page in the new locale.
- Arabic displays right-to-left.

---

### US-05 — Register an Account
**As a** visitor,  
**I want to** create a participant account,  
**so that** I can make donation pledges.

**Acceptance criteria:**
- Registration form requires first name, last name, email, password, and representation type (personal / company / organization).
- I am automatically logged in after registration.
- Duplicate email shows a clear error.

---

### US-06 — Log In
**As a** visitor,  
**I want to** log in with my email and password,  
**so that** I can access my account.

**Acceptance criteria:**
- Incorrect credentials show a clear error.
- Successful login redirects me to the dashboard.
- Session persists across browser refreshes.

---

## Participant

### US-07 — Create a Donation Pledge
**As a** participant,  
**I want to** pledge a donation to a project,  
**so that** I can commit to delivering funds to the organization.

**Acceptance criteria:**
- I click "Donate" on a project page and enter an amount.
- The system creates a donation record with status `pending`.
- I immediately receive a QR code I can download or view on screen.
- The QR code encodes a URL pointing to my donation's verification page.

---

### US-08 — View My Donation History
**As a** participant,  
**I want to** see all my donation pledges and their statuses,  
**so that** I know which ones are pending, approved, or rejected.

**Acceptance criteria:**
- My dashboard lists all my donations with amount, project name, status, and date.
- I can download the QR code for any pending donation.

---

### US-09 — Cancel a Pending Donation
**As a** participant,  
**I want to** cancel a donation I have not yet delivered,  
**so that** I can withdraw my pledge if plans change.

**Acceptance criteria:**
- Cancel button appears only on `pending` donations.
- After cancellation, the status changes to `cancelled`.
- Cancelled donations cannot be reactivated.

---

### US-10 — Forgot Password
**As a** participant,  
**I want to** reset my password via email,  
**so that** I can recover access to my account.

**Acceptance criteria:**
- I enter my email on the forgot-password page.
- I receive a time-limited link in my inbox.
- The link opens a reset form where I set a new password.
- The link expires and shows an error if used after expiry.

---

### US-11 — Update My Profile
**As a** participant,  
**I want to** update my name and representation type,  
**so that** my profile stays accurate.

**Acceptance criteria:**
- Dashboard has an edit profile section.
- I can also upload an avatar image.

---

## Employee

### US-12 — Scan QR Code to Verify Donation
**As an** employee,  
**I want to** scan a participant's QR code when they deliver cash,  
**so that** I can verify their pledge and proceed with approval.

**Acceptance criteria:**
- The Admin → Donations page has a "Scan QR" button.
- My device camera opens; on scan, donation details appear (participant name, amount, project, status).
- If already approved/rejected/cancelled, I see the current status instead of an action form.

---

### US-13 — Approve or Reject a Donation
**As an** employee,  
**I want to** approve or reject a donation after verifying the cash,  
**so that** the project's funding progress is updated correctly.

**Acceptance criteria:**
- I can choose Approve or Reject with an optional notes field.
- On approval, `Project.progression` recalculates automatically.
- On rejection, the participant can see the reason in their dashboard.
- I cannot change the status of an already-processed donation.

---

### US-14 — Manage Projects
**As an** employee,  
**I want to** create, edit, and manage fundraising projects,  
**so that** participants always see up-to-date campaigns.

**Acceptance criteria:**
- I can create a project with name, description (multi-language), cover image, funding goal, category, location, and expected start date.
- I can upload multiple images and set one as the cover.
- I can toggle a project's active status to hide it from the public site.

---

### US-15 — Manage Content (Blogs / News / Events / About)
**As an** employee,  
**I want to** create and edit content blocks,  
**so that** the website remains informative and current.

**Acceptance criteria:**
- I can create content in multiple languages (en, ar, fr).
- I can upload images and attach files to content blocks.
- I can set start/end dates for time-limited content (events).
- I can toggle visibility without deleting.

---

## Financial Officer

### US-16 — View Assigned Projects
**As a** financial officer,  
**I want to** see only the projects I am assigned to,  
**so that** my view is focused on my responsibilities.

**Acceptance criteria:**
- The Dashboard stats reflect only my assigned projects.
- The Donations page only shows donations for my projects.
- I cannot see or interact with other projects.

---

### US-17 — Approve Donations for My Projects
**As a** financial officer,  
**I want to** approve or reject donations on projects I manage,  
**so that** funds are verified and recorded correctly.

**Acceptance criteria:**
- Same flow as Employee (US-13).
- I can only update status for projects assigned to me by an administrator.

---

## Administrator

### US-18 — Manage Admin Accounts
**As an** administrator,  
**I want to** create, edit, and deactivate staff accounts,  
**so that** access is controlled and up to date.

**Acceptance criteria:**
- I can create accounts with role: administrator, employee, or financial_officer.
- I can deactivate (not delete) accounts so they cannot log in.
- Deactivated accounts retain their history.

---

### US-19 — Assign Financial Officer to Project
**As an** administrator,  
**I want to** assign a financial officer to a project,  
**so that** the right person is responsible for approving its donations.

**Acceptance criteria:**
- On the Projects page I can pick any financial officer account and link it to a project.
- A project can have only one officer at a time; reassigning replaces the previous one.

---

### US-20 — Manage Languages
**As an** administrator,  
**I want to** add, edit, and toggle languages,  
**so that** I can control which languages are available for content translation and the public website.

**Acceptance criteria:**
- I can create a language with code, name, flag, direction (ltr / rtl), and display order.
- Toggling a language inactive hides it from the website's language picker.

---

### US-21 — View Platform-Wide Dashboard
**As an** administrator,  
**I want to** see aggregate stats across all projects and donations,  
**so that** I can monitor the platform's overall health.

**Acceptance criteria:**
- Dashboard shows: total projects, total donations by status, total participants, monthly donation chart.
- Recent donations and recent projects sections give quick access to latest activity.

---

## Summary Table

| # | User Story | Role |
|---|-----------|------|
| US-01 | Browse projects | Visitor |
| US-02 | View project details | Visitor |
| US-03 | Read blogs / news / events | Visitor |
| US-04 | Switch language | Visitor |
| US-05 | Register account | Visitor |
| US-06 | Log in | Visitor |
| US-07 | Create donation pledge | Participant |
| US-08 | View donation history | Participant |
| US-09 | Cancel pending donation | Participant |
| US-10 | Forgot password | Participant |
| US-11 | Update profile | Participant |
| US-12 | Scan QR code | Employee |
| US-13 | Approve / reject donation | Employee |
| US-14 | Manage projects | Employee |
| US-15 | Manage content blocks | Employee |
| US-16 | View assigned projects | Financial Officer |
| US-17 | Approve donations on assigned projects | Financial Officer |
| US-18 | Manage admin accounts | Administrator |
| US-19 | Assign financial officer to project | Administrator |
| US-20 | Manage languages | Administrator |
| US-21 | View platform-wide dashboard | Administrator |
