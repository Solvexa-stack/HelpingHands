# Step 07 — Admin Dashboard: Voting Management UI

## Context

You are working on `apps/admin/src/`.
This step adds the voting management view inside the study detail page built in Step 06.
The voting API from Step 03 is fully working.

---

## Additions to `studies/[id]/page.tsx`

The study detail page already exists. Add a new tab: **"Voting"** alongside the existing sections view.

### Voting tab content

#### When status is `draft` / `in_review`
Show a callout:
> "Voting will be available once the study is published."

#### When status is `published`
Show a form to configure and open voting:
- Start date (datetime picker) — default: now
- End date (datetime picker) — required, must be at least 24h in the future
- "Open Voting" button → calls `PATCH /study/:id/status` with `{ status: "voting_open" }`

#### When status is `voting_open`
Show a live results panel (auto-refreshes every 30s using `setInterval` + React Query):

```
Voting closes in: 2 days, 14 hours, 32 minutes   [countdown timer]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  For       ████████████████████░░░░░░  68% (34 votes)
  Against   ████████░░░░░░░░░░░░░░░░░░  24% (12 votes)
  Abstain   ████░░░░░░░░░░░░░░░░░░░░░░   8%  (4 votes)
  Total: 50 votes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Close Voting Early]   [Extend Deadline]
```

Also show the last 10 public comments (anonymized, with choice badge).

#### When status is `voting_closed`
Show final results (same chart as above, no refresh needed).
Show the action panel:
```
Voting has ended.

Result: 68% in favour

  [✓ Approve Study]     [↩ Request Revision]     [✗ Reject Study]
```

- Approve → `PATCH /study/:id/status { status: "approved" }`
- Revision → `PATCH /study/:id/status { status: "in_review" }`
- Reject → opens modal asking for reason → `PATCH /study/:id/status { status: "rejected", rejectionReason }`

#### When status is `approved` or `rejected`
Show a read-only summary of the final decision with date and admin name.

---

## New page: `studies/[id]/votes/page.tsx` — Full vote audit log

Admin only. Table showing all votes:
- Columns: Voter name, Role, Choice (colored badge), Comment (truncated), Date
- Filterable by choice
- Exportable to CSV (use `papaparse` to generate client-side CSV download)

Link to this page from the voting tab: "View full audit log →" (visible to administrators only).

---

## Countdown timer component

Create `components/voting/countdown-timer.tsx`:
```typescript
// Props: endsAt: Date
// Shows "X days, Y hours, Z minutes"
// Turns red when < 2 hours remaining
// Shows "Voting has ended" when past
// Updates every second with useEffect + setInterval
// Cleanup the interval on unmount
```

---

## Live results chart component

Create `components/voting/vote-results-chart.tsx`:
```typescript
// Props: results: { for: number, against: number, abstain: number, total: number }
// Renders horizontal stacked bar + percentage labels
// Uses Recharts BarChart (horizontal layout)
// Colors: for=green, against=red, abstain=gray
// Shows "No votes yet" when total = 0
```

---

## API additions in `lib/api.ts`

```typescript
votingApi.getResults(studyId)
votingApi.listVotes(studyId, filters)          // admin only
votingApi.exportVotesCsv(studyId)              // client-side via listVotes
```

---

## Notification bell integration

In `components/layout/header.tsx`, add a bell icon with unread count badge.
- On mount, call `GET /notifications/unread-count`
- Poll every 60s
- Clicking opens a dropdown showing last 10 notifications
- Each notification links to the relevant page
- "Mark all read" button at the bottom

```typescript
notificationsApi.getUnreadCount()
notificationsApi.getMyNotifications(page)
notificationsApi.markAllRead()
notificationsApi.markRead(id)
```
