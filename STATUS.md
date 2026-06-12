# HelpingHands — Full Project Status

> Last updated: 2026-06-12

---

## What Is This App?

**HelpingHands** is a donation management platform. The flow works like this:

1. A **Participant** registers on the public website and browses projects
2. They submit a donation request for a project (with an amount)
3. They receive a **QR code** linked to their donation
4. They physically bring money to an office
5. An **Employee** scans the QR code to verify and approves the donation
6. The project's funding progress updates automatically

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS (TypeScript), Prisma ORM, PostgreSQL |
| Public Website | Next.js 14 (App Router), Tailwind CSS, next-intl |
| Admin Dashboard | Next.js 14 (App Router), Tailwind CSS, React Query |
| Database | PostgreSQL via Docker |
| Auth | JWT (access token + refresh token) stored in localStorage |
| File Storage | Local disk (`apps/api/uploads/`), served at `/uploads/` |
| QR Codes | Generated server-side, downloadable as PNG |
| Package Manager | pnpm (monorepo with Turborepo) |

---

## Monorepo Structure

```
HelpingHands/
├── apps/
│   ├── api/          → NestJS REST API          → port 4000
│   ├── web/          → Next.js public website   → port 3002
│   └── admin/        → Next.js admin dashboard  → port 3001
└── packages/
    └── database/     → Prisma schema + migrations + seed
```

---

## Running the Project

```bash
# First time only — full setup
./init

# Every time after that
docker compose up postgres -d
pnpm dev
```

| App | URL |
|---|---|
| Public Website | http://localhost:3002 |
| Admin Dashboard | http://localhost:3001 |
| API | http://localhost:4000 |
| Swagger Docs | http://localhost:4000/api/docs |

---

## User Roles

| Role | Description | Where they log in |
|---|---|---|
| `administrator` | Full access to everything | Admin dashboard |
| `employee` | Manages donations, scans QR codes | Admin dashboard |
| `financial_officer` | Sees only their assigned projects | Admin dashboard |
| `participant` | Creates donation requests | Public website |

### Test Accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

---

## ✅ What Is DONE

### Backend API (apps/api)

All API modules are implemented and working:

| Module | Endpoints | Notes |
|---|---|---|
| Auth | login, register, refresh, logout, /me | JWT access + refresh tokens |
| Projects | list, get, create, update, delete, assign-officer | Filtering by category, status, location, search |
| Donations | list, get, create, approve, reject, cancel, QR generate, QR download | Status: pending → approved/rejected/cancelled |
| Blocks | list, get by id, get by slug, create, update, delete | Multilingual content system |
| Files | upload, list, delete | Saved to disk at `/uploads/`, FK to Block table |
| Participants | list, get, update, toggle active | Linked to User via referenceType |
| Admins | list, get, create, update, toggle active | Role-based (administrator / employee / financial_officer) |
| Languages | list, create, delete | Drives translation system |
| Dashboard | stats, monthly chart | Total projects, donations, participants, amounts |
| QR | generate QR image, download QR | 32-char random token embedded in URL |

**API security:**
- Global `JwtAuthGuard` protects all routes by default
- `@Public()` decorator opts routes out of auth (used for public listing pages)
- `@Roles(...)` restricts to specific admin roles
- CORS configured for ports 3001 and 3002

---

### Admin Dashboard (apps/admin)

**Authentication**
- Login page at `/login` — only `admin` referenceType users can log in
- JWT stored in localStorage, auto-refreshed on 401
- Protected layout wraps all dashboard routes

**Pages available:**

| Section | Page | What it does |
|---|---|---|
| Dashboard | `/dashboard` | Stats cards (projects, donations, participants, revenue), monthly chart |
| Projects | `/projects` | List all projects with status badges, search |
| Projects | `/projects/new` | Create project (block + project in two steps) |
| Projects | `/projects/[id]` | Project detail: cover image, progress bar, donations table, officer card |
| Projects | `/projects/[id]/edit` | Edit project fields and translations |
| Donations | `/donations` | List all donations, filter by status, approve/reject via modal, scan QR, download QR |
| Participants | `/participants` | List participants with search, toggle active |
| Participants | `/participants/[id]` | Participant detail: profile, donation history, stats, activate/deactivate |
| Employees | `/employees` | List admins, create admin (all roles), toggle active |
| Content | `/content/blogs` | List blogs |
| Content | `/content/blogs/new` | Create blog (3 languages: EN/AR/FR) |
| Content | `/content/blogs/[id]/edit` | Edit blog |
| Content | `/content/news` | List news |
| Content | `/content/news/new` | Create news article |
| Content | `/content/news/[id]/edit` | Edit news article |
| Content | `/content/events` | List events |
| Content | `/content/events/new` | Create event (with start/end dates) |
| Content | `/content/events/[id]/edit` | Edit event |
| Content | `/content/about` | List about-us sections |
| Content | `/content/about/new` | Create about section (with classification + order) |
| Content | `/content/about/[id]/edit` | Edit about section |
| Languages | `/languages` | Add / remove supported languages |

**Components built:**
- `BlockForm` — shared form for all content types (blogs/news/events/about), 3-language tabs
- `ImageUpload` — drag & drop file uploader (works in edit mode only, URL input in create mode)
- `Toaster` — toast notification system (success / error)
- `QrScannerModal` — webcam QR scanner for employees to verify donations
- `DonationStatusModal` — approve / reject donation with reason
- `ConfirmDialog` — reusable confirm before delete

---

### Public Website (apps/web)

**Pages available:**

| Page | URL | Notes |
|---|---|---|
| Home | `/[locale]` | Hero, stats, featured projects, latest news, upcoming events — all live from API |
| Projects | `/[locale]/projects` | Grid with category filter (agricultural/industrial/trading), status filter, search |
| Project Detail | `/[locale]/projects/[id]` | Cover image, description, funding progress, donate button |
| Blogs | `/[locale]/blogs` | Grid of all blog posts |
| Blog Detail | `/[locale]/blogs/[slug]` | Full blog post with hero image |
| News | `/[locale]/news` | Grid of all news articles |
| News Detail | `/[locale]/news/[slug]` | Full news article with hero image |
| Events | `/[locale]/events` | Grid of upcoming events |
| Event Detail | `/[locale]/events/[slug]` | Full event with date range |
| About | `/[locale]/about` | About Us page, sections from API |
| Contact | `/[locale]/contact` | Static contact info (not connected to API) |
| Login | `/[locale]/auth/login` | JWT login for participants |
| Register | `/[locale]/auth/register` | Registration with name, email, password, account type |
| Dashboard | `/[locale]/dashboard` | Participant's donation history with QR codes |
| Profile | `/[locale]/dashboard/profile` | Edit name, account type; read-only email |
| Donation QR | `/[locale]/donations/[token]` | Shows QR code for a specific donation |

**Internationalisation:**
- 3 languages: English (`en`), Arabic (`ar`), French (`fr`)
- All translation files exist: `messages/en.json`, `messages/ar.json`, `messages/fr.json`
- RTL support for Arabic via `dir="rtl"` on layout
- Language switcher in navbar

---

### Bugs Fixed (during setup & development)

| Bug | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm` |
| `turbo: command not found` | Run `pnpm install` first |
| Missing Tailwind CSS in both apps | Created `postcss.config.js` in `apps/web` and `apps/admin` |
| `NEXT_PUBLIC_API_URL` undefined | Created `.env.local` in each Next.js app |
| `DATABASE_URL not found` (Prisma) | Created `packages/database/.env` |
| `useToast outside Toaster` crash | Made `Toaster` wrap `{children}` inside `ToastContext.Provider` |
| `ScanQrCode` icon crash | `ScanQrCode` doesn't exist in lucide-react v0.395 — replaced with `ScanBarcode` |
| File upload 500 error | `File` model has FK to `Block` — upload only works with valid `referenceId > 0`; drag & drop now disabled in create mode |
| `hero-pattern.svg` 404 | Created `apps/web/public/hero-pattern.svg` |
| CORS blocking web app login | Added `http://localhost:3002` to API CORS allowed origins |
| `Cannot find module './fr.json'` | Created full French translation file |
| `/dashboard/profile` 404 | Created the missing profile page |
| `/blogs/[slug]` 404 | Created detail pages for blogs, news, and events |
| `isCompleted=false` filter broken | `@Type(() => Boolean)` converts string `'false'` → `true`; replaced with `@Transform` in `project.dto.ts` |
| Port 3000 conflict | Changed web app to port 3002 across package.json, docker-compose, and env files |

---

## ❌ What Is NOT Done

### Not Built Yet

| Feature | Details |
|---|---|
| **Contact form submission** | The `/contact` page on the website is static. It shows address/email but does not save or send anything |
| **Email notifications** | SMTP config exists in `.env.example` but no emails are sent (e.g. no email when donation is approved) |
| **Rich text editor** | Block descriptions are plain `<textarea>`. No WYSIWYG/markdown support |
| **Employee edit form** | Employees list has Create + toggle active, but no edit (can't change name, email, or password of an existing admin) |
| **Dashboard chart with real data** | The monthly donations bar chart on the admin dashboard shows "No data yet" — the API returns data but chart rendering needs wiring |
| **Search on content pages** | Blogs, news, events list pages in admin have no search input |
| **Pagination on content pages** | Admin content list pages (blogs, news, events, about) load all records with no pagination |
| **Project image gallery** | Projects support multiple file uploads via the API but only the cover image is shown; no gallery UI |
| **CSV export** | No way to export donations or participants as CSV |
| **Dark mode** | Admin dashboard is light mode only |
| **Multi-language admin** | Admin panel is English only (no i18n) |
| **Password change** | No page for participants or admins to change their own password |
| **Forgot password flow** | API endpoint exists (`POST /auth/forgot-password`) but no email is sent and no reset page exists on the web app |

---

## API ↔ Frontend Connection Map

| Data | Admin fetches from | Web fetches from |
|---|---|---|
| Projects | `GET /api/v1/projects` | `GET /api/v1/projects` |
| Single project | `GET /api/v1/projects/:id` | `GET /api/v1/projects/:id` |
| Donations | `GET /api/v1/donations` | `GET /api/v1/donations` (participant's own) |
| Blocks (blogs/news/events/about) | `GET /api/v1/blocks` | `GET /api/v1/blocks` |
| Block by slug | — | `GET /api/v1/blocks/slug/:slug` |
| Participants | `GET /api/v1/participants` | — |
| Admins | `GET /api/v1/admins` | — |
| Dashboard stats | `GET /api/v1/dashboard/stats` | — |
| File upload | `POST /api/v1/files/upload` | — |
| QR code download | `GET /api/v1/donations/:token/qr/download` | `GET /api/v1/donations/:token/qr` |

---

## Database Models (Summary)

| Model | Purpose |
|---|---|
| `User` | Base user (email, password hash, referenceType) |
| `Admin` | Admin user (firstName, lastName, role: administrator/employee/financial_officer) |
| `Participant` | Participant user (firstName, lastName, representation: personal/company/organization) |
| `Project` | Donation project (category, value, progression, isCompleted, location, dates) |
| `Block` | Multilingual content record used by projects, blogs, news, events, about |
| `BlockTranslation` | Translation per language for a Block (name, slug, brief, description) |
| `ProjectDonation` | A donation by a participant to a project (amount, status, QR token) |
| `File` | Uploaded file record (url, type, isCover, linked to Block) |
| `Language` | Supported language (code: en/ar/fr, name) |

---

## Important Implementation Notes

- **Image upload requires an existing record**: The `File` model has a foreign key to `Block`. You cannot upload a file before the block is created. This means image upload only works in **edit mode**, not create mode. In create mode, only a URL text field is shown.

- **Project creation is two-step**: Creating a project requires first creating a `Block` (which holds translations + image), then creating a `Project` linked to that block. The admin form does both in sequence automatically.

- **Donation status flow**: `pending` → `approved` or `rejected` or `cancelled`. Once approved or rejected, the status cannot change. Cancellation is done by the participant.

- **Project progress auto-updates**: When a donation is approved or rejected, the API recalculates the project's `progression` (percentage) and `isCompleted` flag automatically.

- **QR token**: Each donation has a unique 32-character random token. The QR code encodes a URL: `{WEB_URL}/donations/{token}`. When scanned, it opens the donation page. Employee clicks approve in the admin.

- **Financial officer scope**: When a financial officer logs into admin, they only see projects assigned to them (enforced server-side in `projects.service.ts`).
