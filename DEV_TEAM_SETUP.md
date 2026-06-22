# HelpingHands — Dev Team Setup Guide

Welcome to the team. This guide walks you through running the project on your machine from zero to fully working in under 10 minutes.

---

## What You Will Run

| App | URL | Description |
|-----|-----|-------------|
| API | http://localhost:4000 | NestJS REST backend |
| Web | http://localhost:3000 | Public donation website |
| Admin | http://localhost:3001 | Admin dashboard |

---

## Requirements — Install These Before Starting

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 or higher | https://nodejs.org |
| pnpm | 9 or higher | `npm install -g pnpm@9` |
| Docker Desktop | any | https://www.docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |

Verify your versions:

```bash
node -v    # must show v20.x or higher
pnpm -v    # must show 9.x
docker -v  # any version is fine
```

---

## Step 1 — Clone the Repository

```bash
git clone <repo-url> HelpingHands
cd HelpingHands
```

---

## Step 2 — Create the `.env` File

Run this from the project root (the `HelpingHands` folder):

```bash
cp .env.example .env
```

> The default values work for local development. You do not need to change anything to run the project.
> Only Stripe/PayPal keys and SMTP credentials are needed if you want payments and emails to work.

---

## Step 3 — Install All Dependencies

> **This step is required before anything else will work.**

```bash
pnpm install
```

This installs packages for all apps (`api`, `web`, `admin`) and the `database` package at once.
First run takes 1–3 minutes.

---

## Step 4 — Start the Database and Redis

Make sure **Docker Desktop is open and running**, then run:

```bash
docker compose up postgres redis -d
```

This starts two containers in the background:
- **PostgreSQL** on port `5432` — the main database
- **Redis** on port `6379` — handles background email and payment queues

Verify they are running:

```bash
docker compose ps
```

Both containers should show status **`healthy`**.

---

## Step 5 — Run Database Migrations

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

This creates all database tables. You will see output like:

```
Applying migration `20260606121621_init`
Applying migration `20260606140000_add_user_relations`
...
Your database is now in sync with your schema.
✔ Generated Prisma Client
```

---

## Step 6 — Seed the Database

```bash
pnpm --filter @helping-hands/database db:seed
```

This creates test accounts and sample data:
- 4 user accounts (admin, employee, financial officer, participant)
- Sample donation projects
- Study department templates with Arabic and French translations

---

## Step 7 — Start the Apps

You need **3 separate terminal windows** open at the same time.

**Terminal 1 — API (backend)**
```bash
pnpm --filter @helping-hands/api dev
```
Wait for: `Application is running on: http://localhost:4000`

---

**Terminal 2 — Web (public website)**
```bash
pnpm --filter @helping-hands/web dev
```
Wait for: `Local: http://localhost:3000`

---

**Terminal 3 — Admin dashboard**
```bash
pnpm --filter @helping-hands/admin dev
```
Wait for: `Local: http://localhost:3001`

---

## Step 8 — Open in Browser

| Page | URL |
|------|-----|
| Admin login | http://localhost:3001 |
| Public website | http://localhost:3000/en |
| API health check | http://localhost:4000/api |

---

## Test Accounts

| Role | Email | Password | Login at |
|------|-------|----------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 | http://localhost:3001 |
| Employee | employee@helpinghands.org | Employee@123 | http://localhost:3001 |
| Financial Officer | officer@helpinghands.org | Officer@123 | http://localhost:3001 |
| Participant | participant@example.com | Participant@123 | http://localhost:3000 |

---

## Quick Start — Copy & Paste All Steps

Open **4 terminals** total:

**Terminal 1 — One-time setup (run top to bottom, in order)**
```bash
cp .env.example .env
pnpm install
docker compose up postgres redis -d
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

Then open http://localhost:3001 and log in with `admin@helpinghands.org` / `Admin@123456`.

---

## Common Errors and Fixes

### `command not found: prisma` or `command not found: ts-node`

You skipped Step 3. Run:

```bash
pnpm install
```

Then re-run the migration or seed command.

---

### `Cannot connect to database` or port 5432 refused

Docker is not running or the containers are not started.

```bash
docker compose up postgres redis -d
docker compose ps   # both should show "healthy"
```

---

### `Port 4000 / 3000 / 3001 already in use`

Kill whatever is using that port:

```bash
lsof -ti:4000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

---

### `Module not found` or import errors

Re-install dependencies:

```bash
pnpm install
```

---

### Admin login says "Invalid credentials"

The seed has not been run yet:

```bash
pnpm --filter @helping-hands/database db:seed
```

---

### Prisma client errors after pulling new code

Someone changed the database schema. Run:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

---

## Optional — Visual Database Browser

Open a 5th terminal at any time while the project is running:

```bash
pnpm db:studio
```

Opens http://localhost:5555 — lets you browse and edit every table in the database visually.

---

## Useful Commands Reference

```bash
# Start all 3 apps at once
pnpm dev

# Database
pnpm --filter @helping-hands/database db:migrate:dev   # apply migrations
pnpm --filter @helping-hands/database db:seed          # insert test data
pnpm --filter @helping-hands/database db:reset         # wipe and re-migrate (destructive)
pnpm --filter @helping-hands/database db:generate      # regenerate Prisma client

# Docker
docker compose up postgres redis -d   # start database + redis
docker compose down                   # stop all containers
docker compose ps                     # check container status
docker compose logs postgres          # view database logs
```
