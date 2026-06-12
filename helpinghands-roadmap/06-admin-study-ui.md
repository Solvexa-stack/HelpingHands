# Step 06 — Admin Dashboard: Study Management UI

## Context

You are working on `apps/admin/src/`.
The API endpoints from Steps 02–05 are fully built and working.
Follow existing admin patterns: same Axios client, same auth context, same Tailwind + Radix UI components.

---

## New routes to add

```
apps/admin/src/app/(dashboard)/
├── studies/
│   ├── page.tsx                    ← list all studies with status filter
│   ├── [id]/
│   │   ├── page.tsx                ← study detail + section management
│   │   └── sections/[sectionId]/
│   │       └── page.tsx            ← edit a single section
└── projects/page.tsx               ← MODIFY: add "Create Study" button per project
```

---

## Add to sidebar navigation

In `components/layout/sidebar.tsx`, add under Projects:

```
Studies        → /(dashboard)/studies
  (visible to: Administrator, Employee, Financial Officer)
```

---

## Page: `studies/page.tsx` — Study List

### Layout
Full-width table using `@tanstack/react-table`. Columns:
- Project name (link to project)
- Project type (badge: agricultural / industrial / etc.)
- Study status (colored badge)
- Sections progress (e.g. "5/7 completed" as a mini progress bar)
- Vote result (for% / against% / abstain% — shown only if voting happened)
- Created date
- Actions: View, Change Status

### Filters (top bar)
- Status filter: all / draft / in_review / published / voting_open / voting_closed / approved / rejected
- Search by project name

### Status badge colors
- `draft` → gray
- `in_review` → amber
- `published` → blue
- `voting_open` → purple
- `voting_closed` → coral
- `approved` → green
- `rejected` → red

---

## Page: `studies/[id]/page.tsx` — Study Detail

### Top section
- Project name, type, location
- Study status badge (large)
- Status change button → opens `ChangeStudyStatusModal`
- Study summary (editable textarea for admins)
- Voting period dates (editable date pickers)

### Sections grid
Display each section as a card. Each card shows:
- Section name + required badge
- Status badge
- Assigned admin name (dropdown to reassign)
- Content preview (first 100 chars)
- File count
- "Edit section" button → navigates to section edit page

### Vote results panel (shown when status ≥ published)
Horizontal bar chart using Recharts:
```
For      ████████████████ 64%
Against  ███████ 28%
Abstain  ██ 8%
Total votes: 25
```
Show voting dates. If voting is open, show countdown timer.

### Timeline sidebar
Vertical timeline of status changes:
- Draft created (date)
- Submitted for review (date)
- Published (date)
- Voting opened (date)
- Voting closed (date)
- Approved / Rejected (date)

---

## Page: `studies/[id]/sections/[sectionId]/page.tsx` — Edit Section

### Layout
Two-column: editor on left, files on right.

### Editor (left)
- Section name (read-only)
- Description/guidance text (read-only, from template)
- Rich text content area (use a simple `<textarea>` with markdown support — install `react-md-editor` or use plain textarea)
- Status dropdown: pending / in_progress / completed / needs_revision
- Save button (auto-saves on blur)

### Files panel (right)
- Upload area (drag & drop or click) for PDFs, images
- List of uploaded files with name, type icon, delete button
- Preview for images
- Download link for PDFs

---

## Modal: `ChangeStudyStatusModal`

Shows the valid next transitions for the current status. For each valid transition, show a button with description of what it means.

For `voting_closed → rejected`, require a text input for rejection reason.

```
Current: voting_closed
Available actions:
  [Approve Study]   → opens donations
  [Request Revision] → sends back to in_review
  [Reject Study]    → requires reason text
```

---

## Modify `projects/page.tsx`

Add a column "Study status" to the projects table. If no study exists, show a "Create Study" button that calls `POST /study` and redirects to the new study page.

---

## API client additions in `lib/api.ts`

```typescript
studiesApi.list(filters)
studiesApi.get(id)
studiesApi.create(projectId)
studiesApi.changeStatus(id, status, reason?)
studiesApi.updateSection(sectionId, data)
studiesApi.uploadSectionFiles(sectionId, formData)
studiesApi.deleteSectionFile(fileId)
studiesApi.getVoteResults(studyId)
```

---

## Component: `StudyStatusBadge`

Reusable badge component used across all study-related pages:
```typescript
// props: status: StudyStatus
// renders colored badge with icon
```

---

## Important UX rules

- Employees can edit sections but CANNOT change study status (admin only)
- Financial officers can VIEW studies for their projects but cannot edit
- When all required sections are completed, show a banner: "All required sections are complete. Ready to submit for review."
- Show a confirmation dialog before any status change
- After approving a study, show a success banner: "Study approved. Donations are now open for this project."
