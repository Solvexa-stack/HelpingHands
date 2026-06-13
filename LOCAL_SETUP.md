# HelpingHands — Local Development Setup

Full step-by-step guide to run the project on your machine.  
Every terminal command is labeled with **which terminal** to open it in.

---

## What You Will Be Running

| App | URL | Description |
|-----|-----|-------------|
| API (NestJS) | http://localhost:4000 | REST backend |
| Web (Next.js) | http://localhost:3000 | Public donation website |
| Admin (Next.js) | http://localhost:3001 | Admin dashboard |
| Prisma Studio | http://localhost:5555 | Database visual browser (optional) |

---

## Prerequisites — Install These First

Before anything else, make sure these are installed on your machine:

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm install -g pnpm@9` |
| Docker Desktop | any | https://www.docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |

Check your versions:

```bash
node -v       # must be v20.x or higher
pnpm -v       # must be 9.x
docker -v     # any recent version
```

---

## Step 1 — Clone the Project

> **Terminal 1** — you can close this terminal after the setup is done

```bash
git clone <your-repo-url> HelpingHands
cd HelpingHands
```

---

## Step 2 — Create the `.env` File

> **Terminal 1** — run this one time from the project root

```bash
cp .env.example .env
```

The file is already configured for local development. Here are all the variables and what they do:

```bash
# ── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=development
APP_PORT=4000                          # port the API runs on
APP_URL=http://localhost:4000          # full URL of the API
WEB_URL=http://localhost:3000          # full URL of the public website
ADMIN_URL=http://localhost:3001        # full URL of the admin dashboard

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"
# postgres = user, password = password, helping_hands = database name

# ── JWT (Authentication tokens) ───────────────────────────────────────────────
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m                     # access token expires after 15 minutes
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d              # refresh token expires after 7 days

# ── File Uploads ──────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads                   # folder where uploaded files are saved
MAX_FILE_SIZE=10485760                 # max 10 MB per file

# ── Email (SMTP) ──────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@helpinghands.org     # change to your Gmail address
SMTP_PASS=your-smtp-password           # use a Gmail App Password, not your real password
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"

# ── Next.js Public Website ────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Next.js Admin ─────────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api

# ── Stripe (online payments) ──────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...          # get from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=whsec_...        # get from Stripe CLI: stripe listen
STRIPE_PUBLISHABLE_KEY=pk_test_...     # get from same Stripe page

# ── PayPal (online payments) ──────────────────────────────────────────────────
PAYPAL_CLIENT_ID=...                   # get from https://developer.paypal.com
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox                    # use "live" in production

# ── Payment redirect pages ────────────────────────────────────────────────────
PAYMENT_SUCCESS_URL=http://localhost:3000/en/donations/success
PAYMENT_CANCEL_URL=http://localhost:3000/en/donations/cancel

# ── Redis (background job queues) ─────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
```

**You do NOT need to change anything to run the project locally.**  
Email and payments only work if you fill in the real keys.

---

## Step 3 — Start the Database and Redis

> **Terminal 1**

```bash
docker compose up postgres redis -d
```

This starts two containers in the background:
- **PostgreSQL** on port `5432` — stores all data (users, projects, donations, studies, votes)
- **Redis** on port `6379` — handles background email and payment job queues

Verify they are running:

```bash
docker compose ps
```

You should see both containers with status **`healthy`**.

---

## Step 4 — Install All Dependencies

> **Terminal 1**

```bash
pnpm install
```

This installs packages for all apps (`api`, `web`, `admin`) and the `database` package at once using workspaces.  
First time takes 1–3 minutes.

---

## Step 5 — Run Database Migrations

> **Terminal 1**

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

This creates all database tables. You will see:

```
Applying migration `20260606121621_init`
Applying migration `20260606140000_add_user_relations`
Applying migration `20260612185553_add_study_voting_payment_system`
Applying migration `20260612192240_add_webhook_log`
Applying migration `20260612192949_add_notifications`
Applying migration `20260613120000_add_section_multilingual`

Your database is now in sync with your schema.
✔ Generated Prisma Client
```

---

## Step 6 — Seed the Database

> **Terminal 1**

```bash
pnpm --filter @helping-hands/database db:seed
```

This inserts:
- 4 test user accounts (admin, employee, financial officer, participant)
- Sample donation projects and content blocks
- All 55 study department templates with **Arabic and French translations**
- Sample donations, studies, and voting data

---

## Step 7 — Start All Three Apps

You need **3 separate terminals** open at the same time — one per app.

---

### Terminal 2 — API (Backend)

```bash
pnpm --filter @helping-hands/api dev
```

Wait until you see:

```
[Nest] LOG  Nest application successfully started
[Nest] LOG  Application is running on: http://localhost:4000
```

The API is now live. All endpoints are at `http://localhost:4000/api/`.

---

### Terminal 3 — Web (Public Website)

```bash
pnpm --filter @helping-hands/web dev
```

Wait until you see:

```
▲ Next.js 14
Local:  http://localhost:3000
```

---

### Terminal 4 — Admin Dashboard

```bash
pnpm --filter @helping-hands/admin dev
```

Wait until you see:

```
▲ Next.js 14
Local:  http://localhost:3001
```

---

## Step 8 — Open in Your Browser

| What | URL |
|------|-----|
| Admin login page | http://localhost:3001 |
| Public website | http://localhost:3000/en |
| API swagger / health | http://localhost:4000/api |

---

## Test Accounts

These accounts are created by the seed script.

| Role | Email | Password | Login at |
|------|-------|----------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 | http://localhost:3001 |
| Employee | employee@helpinghands.org | Employee@123 | http://localhost:3001 |
| Financial Officer | officer@helpinghands.org | Officer@123 | http://localhost:3001 |
| Participant | participant@example.com | Participant@123 | http://localhost:3000 |

**Admin roles explained:**
- **Administrator** — full access: can approve/reject studies, manage all users, change any status
- **Employee** — can work on study sections and manage donations
- **Financial Officer** — read-only access, sees only projects assigned to them

---

## Optional — Open Prisma Studio (Visual Database Browser)

> **Terminal 5** (open any time while the project is running)

```bash
pnpm db:studio
```

Opens http://localhost:5555 — a web UI where you can see and edit every table in the database.

---

## Full Project Structure

```
HelpingHands/
│
├── apps/
│   │
│   ├── api/                        # NestJS REST API — port 4000
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/           # Login, register, JWT, refresh tokens
│   │       │   ├── users/          # Admin and participant user management
│   │       │   ├── projects/       # Donation project CRUD
│   │       │   ├── donations/      # Cash and online donations
│   │       │   ├── study/          # Feasibility studies and sections
│   │       │   ├── voting/         # Participant voting on studies
│   │       │   ├── payments/       # Stripe + PayPal payment processing
│   │       │   ├── notifications/  # In-app notifications
│   │       │   ├── email/          # Email sending with HTML templates
│   │       │   └── dashboard/      # Stats and counts for admin home
│   │       └── prisma/             # Prisma database service
│   │
│   ├── web/                        # Next.js public website — port 3000
│   │   ├── messages/               # Translations: en.json, ar.json, fr.json
│   │   └── src/app/[locale]/
│   │       ├── projects/           # Browse projects, donate button
│   │       ├── projects/[id]/      # Single project page with study
│   │       ├── dashboard/          # Participant personal dashboard
│   │       └── donations/          # Payment success and cancel pages
│   │
│   └── admin/                      # Next.js admin dashboard — port 3001
│       ├── messages/               # Translations: en.json, ar.json, fr.json
│       └── src/
│           ├── app/(dashboard)/
│           │   ├── projects/       # Manage projects
│           │   ├── studies/        # Manage studies and sections
│           │   ├── studies/[id]/   # Study detail: sections, voting, timeline
│           │   ├── donations/      # View all donations
│           │   ├── participants/   # Manage participant accounts
│           │   └── team/           # Manage admin team members
│           ├── components/
│           │   ├── layout/         # Sidebar, header (fully translated)
│           │   ├── study/          # Status badge, status modal
│           │   └── voting/         # Countdown timer, vote charts
│           └── contexts/
│               ├── auth-context    # Login state, JWT token management
│               └── language-context # Language switching (en/ar/fr)
│
└── packages/
    └── database/
        └── prisma/
            ├── schema.prisma       # All database models
            ├── seed.ts             # Test data script
            └── migrations/         # All applied migrations
```

---

## Languages

The admin dashboard and public website support 3 languages.  
Switch language from the top-right language button.

| Language | Code | Text direction |
|----------|------|---------------|
| English | en | Left to right |
| Arabic | ar | Right to left (RTL layout) |
| French | fr | Left to right |

Everything is translated including:
- Navigation labels and page titles
- All table headers and buttons
- Study section names and descriptions (stored in DB in all 3 languages)
- Status labels, role names, error messages

---

## All Commands Reference

Run all commands from the **project root** folder.

### Development

```bash
# Start all 3 apps at the same time
pnpm dev

# Start apps one by one
pnpm --filter @helping-hands/api dev        # API on port 4000
pnpm --filter @helping-hands/web dev        # Web on port 3000
pnpm --filter @helping-hands/admin dev      # Admin on port 3001
```

### Database

```bash
# Apply all pending migrations (dev mode — creates migration if schema changed)
pnpm --filter @helping-hands/database db:migrate:dev

# Apply migrations in production (no interactive prompts)
pnpm --filter @helping-hands/database db:migrate

# Insert seed/test data
pnpm --filter @helping-hands/database db:seed

# Reset database completely (drops all data and re-runs all migrations)
pnpm --filter @helping-hands/database db:reset

# Regenerate Prisma client after schema.prisma changes
pnpm --filter @helping-hands/database db:generate

# Open visual database browser
pnpm db:studio
```

### Docker

```bash
# Start only database and Redis (for local dev)
docker compose up postgres redis -d

# Start everything including API, web, admin via Docker
docker compose up -d

# Stop all containers
docker compose down

# Check container status
docker compose ps

# View logs for a specific container
docker compose logs postgres
docker compose logs redis
docker compose logs api
```

### Build (for production)

```bash
# Build all apps
pnpm build

# Build a single app
pnpm --filter @helping-hands/api build
pnpm --filter @helping-hands/web build
pnpm --filter @helping-hands/admin build
```

---

## Troubleshooting

### "Cannot connect to database" or connection refused on port 5432

Docker is not running or the container is not healthy.

```bash
# Check status
docker compose ps

# Start the containers
docker compose up postgres redis -d

# View database logs if still failing
docker compose logs postgres
```

---

### "Port 4000 / 3000 / 3001 already in use"

Something else is using that port. Kill it:

```bash
# Mac / Linux
lsof -ti:4000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

---

### "Module not found" or import errors

Re-install all packages:

```bash
pnpm install
```

---

### "Prisma client is not generated" or Prisma errors

```bash
pnpm --filter @helping-hands/database db:generate
```

Run this any time you change `packages/database/prisma/schema.prisma`.

---

### Admin login says "Invalid credentials"

The seed has not been run. Run:

```bash
pnpm --filter @helping-hands/database db:seed
```

---

### Study section names are still in English when Arabic/French is selected

Make sure migration `20260613120000_add_section_multilingual` was applied:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

Then reseed to get the translations:

```bash
pnpm --filter @helping-hands/database db:seed
```

---

### Changes to `schema.prisma` are not reflected

You must run a migration and regenerate the client:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
# this also runs db:generate automatically
```

---

## Quick Start — Copy & Paste

Open **5 terminals** total. Run one block per terminal:

**Terminal 1 — One-time setup**
```bash
cp .env.example .env
docker compose up postgres redis -d
pnpm install
pnpm --filter @helping-hands/database db:migrate:dev
pnpm --filter @helping-hands/database db:seed
```

**Terminal 2 — API**
```bash
pnpm --filter @helping-hands/api dev
```

**Terminal 3 — Web**
```bash
pnpm --filter @helping-hands/web dev
```

**Terminal 4 — Admin**
```bash
pnpm --filter @helping-hands/admin dev
```

**Terminal 5 — Database browser (optional)**
```bash
pnpm db:studio
```

Then go to http://localhost:3001 and log in:
- Email: `admin@helpinghands.org`
- Password: `Admin@123456`
