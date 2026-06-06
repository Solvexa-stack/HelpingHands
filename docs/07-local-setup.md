# Running the Project Locally

This guide walks you from a blank machine to a fully running HelpingHands stack on your laptop.

---

## Prerequisites

| Tool | Minimum version | Check |
|------|----------------|-------|
| Node.js | 20.x | `node -v` |
| pnpm | 9.x | `pnpm -v` |
| Docker Desktop | any recent | `docker -v` |
| Git | any | `git -v` |

Install pnpm if missing:
```bash
npm install -g pnpm@9
```

---

## Step 1 — Clone and Install

```bash
git clone https://github.com/your-org/HelpingHands.git
cd HelpingHands

pnpm install
```

This installs dependencies for all workspaces (api, web, admin, database) in one command.

---

## Step 2 — Environment Files

Copy the example env file and edit it:

```bash
cp .env.example .env
```

The defaults work out of the box for local development. You only need to change:

| Variable | What to set |
|----------|-------------|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Your SMTP credentials (optional — only needed to test email) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Any long random string for local dev |

**Frontend env files** are read from `.env` at the root. If you need to override per-app:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

---

## Step 3 — Start PostgreSQL (Docker)

Only the database runs in Docker during local development; the apps run natively on Node.

```bash
docker compose up postgres -d
```

Verify it is healthy:
```bash
docker compose ps
# postgres should show (healthy)
```

---

## Step 4 — Run Database Migrations and Seed

```bash
# Apply all migrations
pnpm --filter @helping-hands/database db:migrate:dev

# Seed test accounts and sample data
pnpm --filter @helping-hands/database db:seed
```

---

## Step 5 — Start All Apps

```bash
pnpm dev
```

Turbo runs all three apps in parallel with hot reload:

| App | URL |
|-----|-----|
| API | http://localhost:4000 |
| Web | http://localhost:3000 |
| Admin | http://localhost:3001 |
| Swagger | http://localhost:4000/api/docs |

---

## Running Individual Apps

```bash
# API only
pnpm --filter @helping-hands/api dev

# Public website only
pnpm --filter @helping-hands/web dev

# Admin dashboard only
pnpm --filter @helping-hands/admin dev
```

---

## Useful Dev Commands

```bash
# Open Prisma Studio (visual DB browser at http://localhost:5555)
pnpm db:studio

# Re-generate Prisma client after schema changes
pnpm --filter @helping-hands/database db:generate

# Create a new migration after editing schema.prisma
pnpm --filter @helping-hands/database db:migrate:dev -- --name your_migration_name

# Reset the DB (wipes all data, re-runs all migrations, then seeds)
pnpm --filter @helping-hands/database db:reset

# Run linter across all packages
pnpm lint

# Format all files
pnpm format
```

---

## Test Accounts

After seeding, these accounts are ready:

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

- Log in to **http://localhost:3001** with the admin/employee/officer accounts.
- Log in to **http://localhost:3000** with the participant account.

---

## Troubleshooting

### Port already in use

```bash
# Find and kill the process on a port (example: 4000)
lsof -ti:4000 | xargs kill -9
```

### Prisma client out of sync

Run after any schema change:
```bash
pnpm --filter @helping-hands/database db:generate
```

### Cannot connect to PostgreSQL

Make sure Docker is running and the container is healthy:
```bash
docker compose up postgres -d
docker compose ps
```

### pnpm workspace package not found

Run from the repo root:
```bash
pnpm install
```

### TypeScript errors in IDE after a pull

The Prisma client types are generated at build time. If you pulled new migrations, run:
```bash
pnpm --filter @helping-hands/database db:migrate:dev
pnpm --filter @helping-hands/database db:generate
```
