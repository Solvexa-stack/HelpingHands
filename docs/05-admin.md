# Admin Dashboard (`apps/admin`)

## Overview

The internal Next.js 14 application used by administrators, employees, and financial officers to manage the platform.

- **Port:** 3001
- **Framework:** Next.js 14 App Router
- **No locale prefix** — admin UI is English only
- **Auth guard:** The `(dashboard)` route group checks for a valid admin token on every render
- **Access:** Only users with `referenceType === "admin"` can log in

---

## Routes

| Route | Auth? | Roles | Description |
|-------|-------|-------|-------------|
| `/` | No | — | Redirects to `/login` or `/dashboard` |
| `/login` | No | — | Admin login form |
| `/(dashboard)/dashboard` | Yes | All | Overview: stats cards + charts + recent activity |
| `/(dashboard)/projects` | Yes | All | Create, edit, delete projects; assign financial officers |
| `/(dashboard)/donations` | Yes | All | View, approve, reject donations; QR scanner |
| `/(dashboard)/participants` | Yes | Admin / Employee | List participants; toggle active status |
| `/(dashboard)/employees` | Yes | Admin | Create / manage admin accounts |
| `/(dashboard)/languages` | Yes | Admin | Manage supported languages |
| `/(dashboard)/content/blogs` | Yes | Admin / Employee | Create and edit blog posts |
| `/(dashboard)/content/news` | Yes | Admin / Employee | Create and edit news items |
| `/(dashboard)/content/events` | Yes | Admin / Employee | Create and edit events |
| `/(dashboard)/content/about` | Yes | Admin / Employee | Edit About Us content |

---

## Directory Structure

```
apps/admin/src/
├── app/
│   ├── page.tsx                          # Redirect root
│   ├── login/
│   │   └── page.tsx                      # Login page
│   └── (dashboard)/
│       ├── layout.tsx                    # Protected layout with sidebar + header
│       ├── dashboard/page.tsx
│       ├── projects/page.tsx
│       ├── donations/page.tsx
│       ├── participants/page.tsx
│       ├── employees/page.tsx
│       ├── languages/page.tsx
│       └── content/
│           ├── blogs/page.tsx
│           ├── news/page.tsx
│           ├── events/page.tsx
│           └── about/page.tsx
│
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx                   # Role-filtered navigation links
│   │   └── header.tsx                    # User info + logout
│   ├── donations/
│   │   ├── qr-scanner-modal.tsx          # Camera-based QR scanner
│   │   └── donation-status-modal.tsx     # Approve / reject form
│   ├── admins/
│   │   └── create-admin-modal.tsx        # Create / edit admin
│   └── ui/
│       ├── confirm-dialog.tsx            # "Are you sure?" prompt
│       └── toaster.tsx                   # Toast notification container
│
├── contexts/
│   └── auth-context.tsx                  # Admin auth state
│
├── lib/
│   └── api.ts                            # Axios instance + all admin API calls
│
└── providers.tsx                         # QueryClientProvider, ToastProvider
```

---

## Role-Based Sidebar Visibility

The sidebar hides links the current user cannot use:

| Link | Visible to |
|------|-----------|
| Dashboard | All |
| Projects | All |
| Donations | All |
| Participants | Administrator, Employee |
| Employees | Administrator only |
| Languages | Administrator only |
| Content (Blogs/News/Events/About) | Administrator, Employee |

---

## QR Scanner Flow (Donations Page)

1. Employee clicks **"Scan QR"** button on the Donations page.
2. `QrScannerModal` opens and activates the device camera.
3. On successful scan, the modal extracts the `token` from the URL in the QR code.
4. Calls `donationsApi.getByToken(token)` — shows donation details.
5. Employee clicks **Approve** or **Reject** → `donationStatusModal` opens.
6. Submits `PATCH /donations/:id/status` with `{ status, notes }`.
7. Table refreshes; project progression updates automatically.

---

## Authentication (`contexts/auth-context.tsx`)

Token keys: `admin_access_token`, `admin_refresh_token`

On login, the context validates that the returned user has `referenceType === "admin"`. Regular participants cannot log in to the admin dashboard.

The `(dashboard)/layout.tsx` reads the auth context on mount; if no token is found it immediately redirects to `/login`.

---

## API Client (`lib/api.ts`)

```typescript
// Auth
authApi.login(email, password)
authApi.getMe()
authApi.logout()

// Dashboard
dashboardApi.stats()
dashboardApi.recentDonations()
dashboardApi.recentProjects()
dashboardApi.donationsByMonth()

// Projects
projectsApi.list(filters)
projectsApi.get(id)
projectsApi.create(data)
projectsApi.update(id, data)
projectsApi.delete(id)
projectsApi.assignOfficer(id, officerId)

// Donations
donationsApi.list(filters)
donationsApi.get(id)
donationsApi.getByToken(token)
donationsApi.updateStatus(id, { status, notes })

// Admins (staff)
adminsApi.list(filters)
adminsApi.get(id)
adminsApi.create(data)
adminsApi.update(id, data)
adminsApi.toggleActive(id)
adminsApi.financialOfficers()

// Participants
participantsApi.list(filters)
participantsApi.get(id)
participantsApi.toggleActive(id)

// Content blocks
blocksApi.list(category?, filters)
blocksApi.get(id)
blocksApi.create(data)
blocksApi.update(id, data)
blocksApi.delete(id)
blocksApi.toggleActive(id)

// Languages
languagesApi.list()
languagesApi.create(data)
languagesApi.update(code, data)
languagesApi.delete(code)
languagesApi.toggle(code)

// Files
filesApi.upload(formData)          // multipart: referenceId, referenceType, files[]
filesApi.getFiles(referenceId, referenceType)
filesApi.delete(id)
filesApi.setCover(id)
```

---

## Dashboard Stats

The dashboard page shows:

- **Total projects** / **completed** count
- **Total donations** / breakdown by status (pending, approved, rejected)
- **Total participants**
- **Monthly donations chart** (Recharts bar chart, current year)
- **Recent donations table** (last 5)
- **Recent projects list** (last 5)

Data is role-filtered by the API: financial officers only see their assigned projects.

---

## Environment Variables

```env
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api
```
