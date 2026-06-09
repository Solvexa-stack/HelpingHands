# HelpingHands — Project Progress

## ✅ Done

### Environment & Setup
- Installed `pnpm` and project dependencies
- Created `.env` file from `.env.example`
- Created `.env.local` for `apps/web` and `apps/admin` (Next.js env)
- Created `.env` for `packages/database` (Prisma env)
- Added `postcss.config.js` to both `apps/web` and `apps/admin` (fixes missing Tailwind CSS styles)
- Changed web public site port from `3000` → `3002` (port conflict fix)
- Ran database migrations (`prisma migrate dev`)
- Seeded database with test accounts

### Bug Fixes
- Fixed `useToast outside Toaster` error — `Toaster` now wraps children so all pages can access toast context
- Fixed `ScanQrCode` icon (doesn't exist in lucide-react v0.395) → replaced with `ScanBarcode`
- Fixed API rewrite error in `next.config.mjs` — was using `undefined` because env var wasn't loaded

### Admin CRUD Pages (newly built)
| Page | Create | Edit |
|------|--------|------|
| Projects | `/projects/new` | `/projects/[id]/edit` |
| Blogs | `/content/blogs/new` | `/content/blogs/[id]/edit` |
| News | `/content/news/new` | `/content/news/[id]/edit` |
| Events | `/content/events/new` | `/content/events/[id]/edit` |
| About Us | `/content/about/new` | `/content/about/[id]/edit` |

All content forms support:
- 3-language tabs (English, Arabic, French)
- Title, Slug (auto-generated), Brief, Description
- Image URL, Published toggle
- Events: Start Date / End Date
- About: Classification, Display Order

Projects form supports:
- Category (agricultural / industrial / trading)
- Target Amount, Location
- Expected Start Date, Completion Date
- Financial Officer assignment

### Connected to Landing Page
The web public site (`apps/web`) already fetches all data from the API dynamically:
- Home page shows latest projects, news, events
- Projects page lists all active projects
- Blogs, News, Events pages are fully API-driven
- Anything created in the admin appears on the website automatically

---

## 🔜 Next Features

### High Priority
- [ ] **Image Upload** — replace image URL text input with a real file uploader (drag & drop) using the existing `/files/upload` API endpoint
- [ ] **Project Detail Page in Admin** — view full project info, donations list, assigned officer, and progress bar
- [ ] **Participant Detail Page** — view participant profile, donation history, and account status
- [ ] **Donation QR Code Download** — allow admin/employee to download or print the QR code for a donation

### Medium Priority
- [ ] **Dashboard Charts** — the monthly donations chart currently shows "No data yet" — needs real donation data to populate
- [ ] **Search & Filters on Content Pages** — blogs, news, events list pages have no search yet
- [ ] **Edit Employee/Admin** — employees page has create + toggle active, but no edit form for updating name/role/password
- [ ] **Pagination on Content Pages** — currently loads all records with no pagination
- [ ] **Project Image Gallery** — upload multiple images per project using the files API

### Low Priority / Nice to Have
- [ ] **Rich Text Editor** — replace plain textarea for Description with a WYSIWYG editor (e.g. TipTap or Quill)
- [ ] **Email Notifications** — SMTP is configured but not triggered yet (e.g. notify participant when donation is approved)
- [ ] **Contact Form** — the contact page on the web is hardcoded/static, needs to save submissions or send email
- [ ] **Public Participant Dashboard** — participant can log in at `/dashboard` and see their donations + QR codes
- [ ] **Dark Mode** for admin dashboard
- [ ] **Export to CSV** — export donations list as CSV for financial reporting
- [ ] **Multi-language Admin** — admin panel currently English only

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

---

## Running the Project

```bash
# 1. Start Postgres (Docker must be open)
docker compose up postgres -d

# 2. Start all apps
pnpm dev
```

| App | URL |
|-----|-----|
| Public Website | http://localhost:3002 |
| Admin Dashboard | http://localhost:3001 |
| API | http://localhost:4000 |
