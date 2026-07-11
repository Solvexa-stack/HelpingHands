# Demo Script

> **Audience:** Whoever is presenting HelpingHands live — to government stakeholders, NGO partners, or a pilot sponsor.
> **Duration:** ~38 minutes, plus buffer for questions.
> **Prerequisites:** Fresh seeded database (`pnpm db:seed`), all three apps running (see `DEPLOYMENT.md`), two browser windows/profiles open side by side (one for admin app tabs, one for the public site), and — ideally — the `DEMO_DATA.md` Part B accounts pre-created the day before so you aren't typing passwords live (see the fallback notes; the script also works fully live if you prefer to show the invite flow).
> **Data used:** This script builds the "Al-Karama Water Network Expansion" scenario from `DEMO_DATA.md` Part B. Keep that document open as a cheat sheet for exact names/numbers.

---

## Before you start

- Confirm `admin@helpinghands.org` / `Admin@123456` logs in successfully.
- Confirm the public site loads at its configured port (see `DEPLOYMENT.md` — do not assume 3000; verify against your actual `docker-compose.yml`/`.env`).
- If SMTP is not configured in this environment (likely, per `PILOT_READINESS.md`), invitation/reset "emails" will instead show an on-screen link/token — know this in advance so it doesn't look like a bug mid-demo.
- Have `DEMO_DATA.md` open in a second window for exact copy-paste values.

---

## 00:00 — Login as Platform Admin

**Click:** Open `http://localhost:3001/login` → enter `admin@helpinghands.org` / `Admin@123456` → **Login**.

**Say:** "This one account can see the whole platform — every organization, every fund — because it holds both the platform Administrator role and, automatically, the Board Chair seat."

**Expected result:** Lands on `/dashboard`; sidebar shows the full Platform Workspace (Dashboard, Donations, Projects, Studies, Participants, Employees, Content, Languages, Reports, Audit, Organizations, Workflow, Funds, Board).

**Fallback:** If login fails, confirm the database was actually seeded (`pnpm db:seed` from `packages/database`) and the API is reachable at its configured `NEXT_PUBLIC_ADMIN_API_URL`.

---

## 01:30 — Tour the Dashboard

**Click:** Stay on `/dashboard`.

**Say:** "These numbers — projects, donations, participants, revenue — are computed live from the same read layer that powers the public Transparency Portal later in this demo. They can never disagree."

**Expected result:** One seeded project ("Community Water Well Project") and near-zero donation figures (nothing seeded yet).

---

## 03:00 — Create the Municipality

**Click:** Sidebar → **Organizations** → **Create Organization**.

**Fill in:** Type `municipality`, Name `Al-Karama Municipality`, Registration Number `MUN-2026-0417`.

**Say:** "Municipalities, NGOs, and youth teams are all the same underlying `Organization` record, differentiated by type and by capability flags — not by separate code paths. That's what lets a government entity and a small NGO share every screen you're about to see, just with different permissions."

**Expected result:** Organization created, status `pending_verification`.

**Fallback:** If it already exists from a prior run, open it instead of creating a duplicate — mention that self-service registration is also possible via `/register`, currently allowlist-gated for the pilot.

---

## 06:00 — Verify the Municipality (as Board)

**Click:** Sidebar → **Board** → **Verifications** tab → find Al-Karama Municipality → **Begin Review**.

**Say:** "Before this municipality can execute a single project or receive a cent, the Board has to review it. Verification is blocked until official documents are attached — the platform won't let you skip this."

*(If no documents are attached, briefly show the block, then upload a placeholder PDF to the organization's content block, and proceed.)*

**Click:** **Verify** → **Activate**.

**Say:** "Now let's set what this municipality is allowed to do."

**Click:** Open capability flags → toggle on `canExecuteProjects`, `canReceivePublicFunds`, `isGovernmentEntity`, `requiresBoardOversight`.

**Say:** "That last flag — `requiresBoardOversight` — is the one that will add an extra governance step to this municipality's projects a few minutes from now, instead of public voting."

**Expected result:** Status `active`; capabilities set.

---

## 09:00 — Invite the Municipality's Admin

**Click:** From the organization's detail view → **Invite Admin** → enter Samir Odeh's details from `DEMO_DATA.md` B.2.

**Say:** "This sends an activation-link invite. In this environment SMTP may not be configured, so watch for the fallback link shown on-screen instead of an actual email — that's expected here, not in a production pilot."

**Expected result:** Invite created; activation link visible (copy it for the next step).

**Fallback:** If you pre-created this account the day before, skip straight to logging in as Samir.

---

## 11:00 — Log in as the Municipality Admin, tour the Organization Workspace

**Click:** Open the activation link (or `/login`) in a second browser profile → log in as Samir Odeh.

**Say:** "Notice the sidebar now — Dashboard, Projects, Studies, Donations, Reports, Team, Settings. No Organizations, no Funds, no Audit. This is the Organization Workspace: everything scoped to Al-Karama Municipality alone, and nothing from any other organization is reachable, even by guessing a URL."

**Expected result:** Lands on `/org/dashboard`, showing zeroed-out organization-specific stats.

---

## 13:00 — Create the Project

**Click:** `/org/projects` → **New Project**.

**Fill in:** Name `Al-Karama Water Network Expansion`, Category `Infrastructure → Water`, Fund of record `Development & Infrastructure`, Target value `$180,000`, Location `Al-Karama District, North Region` (full field list in `DEMO_DATA.md` B.4).

**Say:** "Owning organization is auto-filled — you're creating this from inside Al-Karama's own workspace, so there's no way to accidentally create a project for someone else."

**Click:** Save → open the new project → **Participations** panel → **Add Participant** → select "Clean Water Alliance" (create this NGO quickly first if it doesn't exist yet — Organizations → Create, type `ngo`, then verify+activate the same way as Al-Karama, ~1 extra minute) → role `funding_partner`.

**Expected result:** Project appears in `/org/projects` at 0% progress, with Clean Water Alliance listed as a participating organization.

---

## 17:00 — Create and Publish the Study

**Click:** Open the project → **Studies** tab → fill in sections per `DEMO_DATA.md` B.5 (Problem, Objectives, Budget, Timeline; attach a sample document).

**Say:** "This is the platform's core discipline: money doesn't move, and citizens aren't asked to weigh in, on a bare project title. This is the documented case for the spend."

**Click:** Change status `draft → in_review → published`.

**Expected result:** Each transition is only offered when the workflow engine's guards are satisfied — if a button is missing, point out that it's a guard (e.g. incomplete sections), not a bug.

---

## 20:00 — The Governance Fork (Board Review, not Public Voting)

**Say:** "Because Al-Karama has `requiresBoardOversight` set, watch what happens next — it's different from a standard NGO project."

**Click:** On the study, observe the next available action: **Send to Board** (not "Open Voting").

**Say:** "A standard NGO project would open to public voting here instead — same underlying voting engine, just a different workflow definition selected automatically based on the owning organization's type. I can show that path afterward on the seeded Community Water Well project if there's time."

**Click:** Switch back to the Platform Admin browser tab → **Board** → **Queue** tab → find the Al-Karama study → **Approve**, with a written rationale (see `DEMO_DATA.md` B.7 for example text).

**Expected result:** Study status → `approved`; the decision is now permanently recorded (show the **History** tab briefly — no edit/delete button exists anywhere on it).

---

## 24:00 — Funding Agreement

**Click:** Still as Board/Administrator → **Funds** → **Development & Infrastructure** → **Agreements** → **New Agreement** with Al-Karama Municipality, using the terms in `DEMO_DATA.md` B.8.

**Say:** "This is the formal, documented funding relationship — including a real lever: if Al-Karama's reports go overdue, further disbursement can be automatically held. That's what turns 'the municipality got money' into something auditable."

**Click:** Sign → status `active`.

---

## 26:00 — Fund Allocation and Disbursement

**Click:** **Funds** → **Development & Infrastructure** → **Propose Allocation** → project Al-Karama Water Network Expansion, amount `$120,000` (per `DEMO_DATA.md` B.9).

**Click:** **Approve** (as Board) → **Disburse** a first tranche of `$40,000`.

**Say:** "Every one of these stages posts real double-entry ledger transactions behind the scenes — a fund account debited, a project account credited, and it can never just be edited later. Corrections would be a new reversing entry, not a silent change."

**Expected result:** Allocation status `disbursing`; fund dashboard and project financial summary both reflect the $40,000 immediately.

---

## 29:00 — Cash Donation (QR) — Show the Real Flow

**Click:** Switch to the public site (`apps/web`) → log in as `participant@example.com` / `Participant@123` (or self-register a fresh donor) → open the seeded "Community Water Well Project" (simpler than Al-Karama for this step since it has no study gate) → **Donate → Cash** → enter `$250`.

**Say:** "A QR code and a plain-text token both get generated — the donor brings either one, physically, along with the cash."

**Click:** Switch to the admin app → **Donations** → **Scan QR**.

**Say — important, don't skip this:** "Despite the name, this opens a text box, not a camera. Staff paste or type the token, or the full URL — pasting a URL auto-extracts the token. This is intentional current behavior, not a placeholder."

**Click:** Paste the token → look it up → **Approve**.

**Expected result:** Donation status → `approved`; project progress bar updates immediately; a ledger entry posts.

---

## 32:00 — Organization Report

**Click:** Back in Samir Odeh's Organization Workspace → `/org/reports` → **New Report** → type `progress`, period Month 1 (see `DEMO_DATA.md` B.10 for example content).

**Say:** "This is the accountability obligation that comes with the funding agreement — due dates are computed automatically from the agreement's schedule, not manually tracked."

**Click:** Submit → switch to Board → **Reports** tab → **Accept**.

*(Optional, if time allows: submit a financial report, have the Board **Return** it with a comment, then resubmit and accept — demonstrates the revision cycle.)*

---

## 35:00 — The Transparency Portal (the payoff)

**Click:** Open a fresh/incognito browser tab, no login → navigate to the public site's `/transparency`.

**Say:** "No login, anywhere on this page. This is what any citizen, journalist, or auditor can see right now."

**Click:** Through to **Funds** → Development & Infrastructure → point out intake/allocated/disbursed figures and the CSV download.

**Click:** Through to the Al-Karama Water Network Expansion project page → scroll to the **money trail**.

**Say:** "Everything we just did — the $40,000 disbursement, the Board's approval with its written rationale, the progress percentage — is right here, publicly, automatically, within seconds of it happening. Nobody had to manually publish a report for this to appear."

**Expected result:** Money trail shows intake by channel, the fund allocation, the Board decision with rationale and timestamp, and the live progress figure — matching exactly what was shown internally a few minutes earlier.

---

## 38:00 — Close

**Say:** "To summarize the chain you just watched end to end: an organization was verified by an accountable Board, proposed a documented project, went through the governance path appropriate to its type, received Board-approved funding through a real ledger, was held to a reporting obligation, and the entire thing is independently verifiable by the public right now — without asking anyone for access."

**Open the floor for questions.**

---

## Fallback playbook — if something already exists

| Situation | What to do |
|---|---|
| Al-Karama Municipality / Clean Water Alliance already exist from a previous demo run | Open and reuse them instead of creating duplicates; skip straight to whatever stage they're already at. |
| The project already has donations/allocations from a previous run | Either reset the database (`pnpm --filter @helping-hands/database db:reset` then reseed — **destructive**, only between demo sessions, never during a live pilot) or simply narrate the existing state instead of creating new records live. |
| SMTP isn't configured and no invite link appears | Check the API response/logs for the fallback token, or pre-create the demo accounts the day before using the seed/backfill approach instead of the live invite UI. |
| A workflow action you expect is missing from the UI | Don't panic-click — open `/workflow` in a spare tab and show the guard that's blocking it (e.g. "documents_present," "board_decision required"). This is usually a better demo moment than the action itself. |
| Running short on time | Cut the NGO public-voting detour (mentioned at 20:00) and the financial-report revision cycle (mentioned at 32:00) first — everything else is the core chain. |
| Running long / audience wants more | Show the Workflow Definitions viewer (`/workflow`) comparing v1 vs v2 side by side, or the Audit Log (`/audit`) showing every action taken during the demo, timestamped and attributed. |

## Related documents
- `DEMO_DATA.md` — every exact value used above.
- `BUSINESS_FLOW.md` — the narrative explanation of why each stage exists, for pre-demo prep.
- `USER_MANUAL.md` — full detail on every screen touched in this script.
