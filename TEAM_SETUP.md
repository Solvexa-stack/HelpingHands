# HelpingHands — Team Developer Setup Guide

This file is for any developer joining the team.  
Follow every step in order. Do not skip any step.

---

## Ports — What Runs Where

| Service | URL | What it is |
|---------|-----|-----------|
| API | http://localhost:4000 | NestJS backend (all data) |
| API Docs | http://localhost:4000/api/docs | Swagger — browse all endpoints |
| Web | http://localhost:3002 | Public website (Next.js) |
| Admin | http://localhost:3001 | Admin dashboard (Next.js) |
| Prisma Studio | http://localhost:5555 | Visual database browser (optional) |

---

## What You Need to Install First

Install these tools on your computer before anything else.

### 1. Node.js (version 20 or higher)

Download from: https://nodejs.org  
Choose the **LTS** version (20.x).

Verify after install:
```bash
node -v
```
Must show `v20.x.x` or higher.

---

### 2. pnpm (version 9)

After Node is installed, open a terminal and run:

```bash
npm install -g pnpm@9
```

Verify:
```bash
pnpm -v
```
Must show `9.x.x`.

---

### 3. Docker Desktop

Download from: https://www.docker.com/products/docker-desktop  
Install it and **open it** (Docker must be running in the background).

Verify:
```bash
docker -v
```

---

### 4. Git

Download from: https://git-scm.com  
Most computers already have this.

Verify:
```bash
git -v
```

---

## Step 1 — Get the Code

> Open **Terminal 1**

```bash
git clone <paste-the-repo-url-here> HelpingHands
cd HelpingHands
```

Replace `<paste-the-repo-url-here>` with the actual GitHub/GitLab URL the team lead gives you.

---

## Step 2 — Create Your `.env` File

> **Terminal 1** — run from inside the `HelpingHands` folder

```bash
cp .env.example .env
```

This creates your local environment file from the example.  
**You do not need to change anything in this file to run the project locally.**

The full `.env` file looks like this — read it so you understand what each variable does:

```bash
# ── Ports & URLs ─────────────────────────────────────────────────────────────
NODE_ENV=development
APP_PORT=4000
APP_URL=http://localhost:4000
WEB_URL=http://localhost:3002
ADMIN_URL=http://localhost:3001

# ── Database ─────────────────────────────────────────────────────────────────
# This connects to the PostgreSQL container started by Docker
DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"

# ── JWT (login tokens) ───────────────────────────────────────────────────────
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# ── File Uploads ─────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ── Email ────────────────────────────────────────────────────────────────────
# Only needed if you want to test email sending
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@helpinghands.org
SMTP_PASS=your-smtp-password
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"

# ── Next.js Public Website ───────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3002

# ── Next.js Admin Dashboard ──────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api

# ── Stripe (online card payments) ────────────────────────────────────────────
# Only needed if you want to test Stripe payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# ── PayPal payments ──────────────────────────────────────────────────────────
# Only needed if you want to test PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox

# ── Payment redirect pages ───────────────────────────────────────────────────
PAYMENT_SUCCESS_URL=http://localhost:3002/en/donations/success
PAYMENT_CANCEL_URL=http://localhost:3002/en/donations/cancel

# ── Redis (background jobs) ──────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Step 3 — Start the Database and Redis with Docker

> **Terminal 1**

Make sure Docker Desktop is open and running first.

```bash
docker compose up postgres redis -d
```

This downloads and starts two containers:
- **PostgreSQL** on port `5432` — the main database
- **Redis** on port `6379` — used for email and payment job queues

Check they are healthy:

```bash
docker compose ps
```

You should see something like this:

```
NAME                   STATUS
helping_hands_db       Up (healthy)
helping_hands_redis    Up (healthy)
```

Both must say **healthy** before you continue.  
If they say "starting", wait 30 seconds and run `docker compose ps` again.

---

## Step 4 — Install All Packages

> **Terminal 1**

```bash
pnpm install
```

This installs all dependencies for the API, Web, and Admin apps at once.  
First time can take 2–4 minutes. You will see lots of output — this is normal.

---

## Step 5 — Set Up the Database

> **Terminal 1**

Run the migrations (creates all tables):

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

You will see all migrations being applied:

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

Then seed the database (inserts test data and accounts):

```bash
pnpm --filter @helping-hands/database db:seed
```

---

## Step 6 — Start All Apps

You need **3 terminals open at the same time** from this point.  
Keep all of them running while you work.

---

### Terminal 2 — API (Backend)

```bash
pnpm --filter @helping-hands/api dev
```

Wait until you see this in the output:

```
🚀 API running at http://localhost:4000/api
📖 Swagger docs at http://localhost:4000/api/docs
```

Do not close this terminal.

---

### Terminal 3 — Admin Dashboard

```bash
pnpm --filter @helping-hands/admin dev
```

Wait until you see:

```
▲ Next.js 14
- Local: http://localhost:3001
```

Do not close this terminal.

---

### Terminal 4 — Public Website

```bash
pnpm --filter @helping-hands/web dev
```

Wait until you see:

```
▲ Next.js 14
- Local: http://localhost:3002
```

Do not close this terminal.

---

## Step 7 — Open in Your Browser

| What to open | URL |
|-------------|-----|
| Admin dashboard | http://localhost:3001 |
| Public website | http://localhost:3002/en |
| API Swagger docs | http://localhost:4000/api/docs |

---

## Login Accounts

All accounts are created automatically by the seed script in Step 5.

| Role | Email | Password | Where to login |
|------|-------|----------|----------------|
| Administrator | admin@helpinghands.org | Admin@123456 | http://localhost:3001 |
| Employee | employee@helpinghands.org | Employee@123 | http://localhost:3001 |
| Financial Officer | officer@helpinghands.org | Officer@123 | http://localhost:3001 |
| Participant | participant@example.com | Participant@123 | http://localhost:3002 |

**What each admin role can do:**

| Role | Permissions |
|------|------------|
| Administrator | Full access — approve studies, manage users, change all statuses |
| Employee | Can edit study sections, manage donations |
| Financial Officer | Read-only — can only see projects assigned to them |

---

## Project Structure — What Is Where

```
HelpingHands/
│
├── .env                        ← your local config (never commit this)
├── .env.example                ← template for .env
├── docker-compose.yml          ← starts PostgreSQL and Redis
├── package.json                ← root scripts for the whole monorepo
│
├── apps/
│   ├── api/                    ← NestJS backend (port 4000)
│   │   └── src/
│   │       └── modules/
│   │           ├── auth/           login, register, JWT tokens
│   │           ├── users/          admin and participant accounts
│   │           ├── projects/       donation project CRUD
│   │           ├── donations/      cash and online donations
│   │           ├── study/          feasibility studies and sections
│   │           ├── voting/         participant voting on studies
│   │           ├── payments/       Stripe and PayPal integration
│   │           ├── notifications/  in-app notifications
│   │           ├── email/          email sending with templates
│   │           └── dashboard/      stats for the admin home page
│   │
│   ├── web/                    ← Next.js public website (port 3002)
│   │   ├── messages/           ← translations: en.json, ar.json, fr.json
│   │   └── src/app/[locale]/
│   │       ├── projects/           browse and donate to projects
│   │       ├── projects/[id]/      single project page with study
│   │       ├── dashboard/          participant personal dashboard
│   │       └── donations/          payment success and cancel pages
│   │
│   └── admin/                  ← Next.js admin dashboard (port 3001)
│       ├── messages/           ← translations: en.json, ar.json, fr.json
│       └── src/
│           ├── app/(dashboard)/
│           │   ├── projects/       manage donation projects
│           │   ├── studies/        manage studies
│           │   ├── studies/[id]/   study detail, sections, voting
│           │   ├── donations/      all donations list
│           │   ├── participants/   manage participant accounts
│           │   └── team/           manage admin team
│           ├── components/
│           │   ├── layout/         sidebar and header
│           │   ├── study/          study status badge and modal
│           │   └── voting/         countdown timer, vote charts
│           └── contexts/
│               ├── auth-context    handles login state and tokens
│               └── language-context  language switching (en / ar / fr)
│
└── packages/
    └── database/
        └── prisma/
            ├── schema.prisma   ← all database table definitions
            ├── seed.ts         ← test data script
            └── migrations/     ← all database migrations (do not edit manually)
```

---

## Languages

The admin dashboard and public website support 3 languages.  
Switch language from the top-right corner of the app.

| Language | Direction |
|----------|-----------|
| English (en) | Left to right |
| Arabic (ar) | Right to left — full RTL layout |
| French (fr) | Left to right |

Everything switches automatically including study section names and descriptions (stored in the database in all 3 languages).

---

## Commands You Will Use Daily

All commands are run from the **root folder** of the project.

### Starting the apps

```bash
# Start all 3 apps at once (one terminal)
pnpm dev

# Or start each one separately (3 terminals — recommended)
pnpm --filter @helping-hands/api dev
pnpm --filter @helping-hands/admin dev
pnpm --filter @helping-hands/web dev
```

### Database commands

```bash
# Apply new migrations when someone adds them
pnpm --filter @helping-hands/database db:migrate:dev

# Seed test data
pnpm --filter @helping-hands/database db:seed

# Regenerate Prisma client (run this after schema.prisma changes)
pnpm --filter @helping-hands/database db:generate

# Open visual database browser
pnpm db:studio

# Reset database (DELETES ALL DATA and re-runs migrations)
pnpm --filter @helping-hands/database db:reset
```

### Docker commands

```bash
# Start database and Redis
docker compose up postgres redis -d

# Stop everything
docker compose down

# Check what is running
docker compose ps

# View logs
docker compose logs postgres
docker compose logs redis
```

### Code quality

```bash
# Type-check all apps
pnpm typecheck

# Lint all apps
pnpm lint

# Format code
pnpm format
```

---

## When a Teammate Pushes New Code

Every time someone pushes new code, do this:

```bash
# 1 — Pull the latest changes
git pull

# 2 — Install any new packages
pnpm install

# 3 — Apply any new migrations (safe to run even if nothing new)
pnpm --filter @helping-hands/database db:migrate:dev

# 4 — Regenerate Prisma client if schema.prisma changed
pnpm --filter @helping-hands/database db:generate
```

Then restart your terminals.

---

## Troubleshooting

### Error: "Cannot connect to database" or ECONNREFUSED on port 5432

Docker is not running or the containers are not started.

```bash
# Check if Docker Desktop is open (open it manually if not)
docker -v

# Start the containers
docker compose up postgres redis -d

# Check status
docker compose ps
```

Both must show **healthy**.

---

### Error: "Port 4000 already in use" or any port conflict

Something is already running on that port.

**On Mac or Linux:**
```bash
lsof -ti:4000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
```

**On Windows (PowerShell):**
```powershell
# Find what is using port 4000
netstat -ano | findstr :4000

# Kill it by PID (replace 12345 with the actual PID)
taskkill /PID 12345 /F
```

---

### Error: "Cannot find module" or module not found

Re-install packages:

```bash
pnpm install
```

---

### Error: Prisma or "@prisma/client" errors

Regenerate the Prisma client:

```bash
pnpm --filter @helping-hands/database db:generate
```

---

### Error: "Invalid credentials" when logging into admin

The seed was not run. Run it:

```bash
pnpm --filter @helping-hands/database db:seed
```

---

### Error: "Relation does not exist" or missing table errors

Your migrations are not up to date. Run:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

---

### Error: pnpm not found

pnpm is not installed. Run:

```bash
npm install -g pnpm@9
```

---

### Error: "node: command not found" or wrong Node version

Install Node.js 20 from https://nodejs.org  
If you have an older version, use **nvm** to manage versions:

```bash
# Install nvm (Mac/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Then install Node 20
nvm install 20
nvm use 20
```

---

### Changes to schema.prisma are not working

After any change to `packages/database/prisma/schema.prisma`, you must:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

This creates the migration file AND regenerates the Prisma client automatically.

---

## Quick Start — All Commands in One Place

**Do this only the first time (setup):**

> Terminal 1
```bash
cp .env.example .env
docker compose up postgres redis -d
pnpm install
pnpm --filter @helping-hands/database db:migrate:dev
pnpm --filter @helping-hands/database db:seed
```

**Do this every day when you start working:**

> Terminal 2
```bash
pnpm --filter @helping-hands/api dev
```

> Terminal 3
```bash
pnpm --filter @helping-hands/admin dev
```

> Terminal 4
```bash
pnpm --filter @helping-hands/web dev
```

> Terminal 5 (optional — database browser)
```bash
pnpm db:studio
```

**Then open:**
- Admin → http://localhost:3001 — login with `admin@helpinghands.org` / `Admin@123456`
- Web → http://localhost:3002/en
- API docs → http://localhost:4000/api/docs
