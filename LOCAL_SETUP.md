# Local Development Setup

## Prerequisites

- Node.js 18+
- pnpm
- Docker

---

## Step 1 — Clone & Install

```bash
git clone <repo-url>
cd HelpingHands
pnpm install
```

---

## Step 2 — Environment Variables

```bash
cp .env.example .env
```

Also create the database package env file:

```bash
echo 'DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"' > packages/database/.env
```

---

## Step 3 — Start the Database

```bash
docker compose up postgres -d
```

---

## Step 4 — Run Migrations

```bash
pnpm --filter @helping-hands/database db:migrate:dev --name init
```

---

## Step 5 — Seed the Database

```bash
pnpm --filter @helping-hands/database db:seed
```

---

## Step 6 — Start All Apps

```bash
pnpm dev
```

| App   | URL                   |
|-------|-----------------------|
| API   | http://localhost:4000 |
| Web   | http://localhost:3000 |
| Admin | http://localhost:3001 |

---

## Test Accounts

| Role              | Email                       | Password        |
|-------------------|-----------------------------|-----------------|
| Administrator     | admin@helpinghands.org      | Admin@123456    |
| Employee          | employee@helpinghands.org   | Employee@123    |
| Financial Officer | officer@helpinghands.org    | Officer@123     |
| Participant       | participant@example.com     | Participant@123 |

---

## Troubleshooting

**API won't start / port 4000 not listening**
The API must be started manually (turbo's `pnpm dev` starts admin + web; start API separately):
```bash
cd apps/api
rm -f tsconfig.tsbuildinfo          # clear stale incremental cache if needed
npx tsc --project tsconfig.json     # compile
node dist/main.js                   # start
```

**`DATABASE_URL` not found when running migrations**
Prisma reads `.env` from the package directory, not the repo root. The file at
`packages/database/.env` must exist. If missing:
```bash
echo 'DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"' > packages/database/.env
```

---

## Useful Commands

```bash
# Run a single app
pnpm --filter @helping-hands/api dev
pnpm --filter @helping-hands/web dev
pnpm --filter @helping-hands/admin dev

# Reset the database (wipes all data)
pnpm --filter @helping-hands/database db:reset

# Open Prisma Studio (database GUI)
pnpm --filter @helping-hands/database studio

# Build all apps
pnpm build
```
