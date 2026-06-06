# Run Locally (No Docker)

## Requirements

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20 | `nvm install 20` |
| pnpm | >= 9 | `npm install -g pnpm@9` |
| Docker | any | [docker.com](https://www.docker.com) — only for PostgreSQL |

---

## 1. Install Dependencies

```bash
pnpm install
```

---

## 2. Environment

```bash
cp .env.example .env
```

`.env` values for local development:

```env
# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=development
APP_PORT=4000
APP_URL=http://localhost:4000
WEB_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=any-local-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=any-local-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# ─── Storage ─────────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ─── Email (SMTP) ────────────────────────────────────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"

# ─── Next.js Public Website ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Next.js Admin ───────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api
```

---

## 3. Start PostgreSQL

Only the database runs in Docker:

```bash
docker compose up postgres -d
```

---

## 4. Database — Migrate & Seed

```bash
# Run migrations
pnpm --filter @helping-hands/database db:migrate:dev

# Seed test accounts
pnpm --filter @helping-hands/database db:seed
```

---

## 5. Start the Apps

```bash
# All three apps at once (recommended)
pnpm dev
```

Or start each one separately in its own terminal:

```bash
# Terminal 1 — API
pnpm --filter @helping-hands/api dev

# Terminal 2 — Public website
pnpm --filter @helping-hands/web dev

# Terminal 3 — Admin dashboard
pnpm --filter @helping-hands/admin dev
```

---

## URLs

| App | URL |
|-----|-----|
| Public website | http://localhost:3000 |
| Admin dashboard | http://localhost:3001 |
| API | http://localhost:4000 |
| Swagger docs | http://localhost:4000/api/docs |

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

---

## Email (optional)

To test emails locally, run Mailpit — it catches all outgoing mail without sending anything:

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Open the inbox at **http://localhost:8025**. The SMTP values in `.env` above already point to it.

---

## Useful Commands

```bash
# Open Prisma Studio (visual DB browser at http://localhost:5555)
pnpm db:studio

# Re-generate Prisma client after editing schema.prisma
pnpm --filter @helping-hands/database db:generate

# Create a new migration
pnpm --filter @helping-hands/database db:migrate:dev -- --name describe_your_change

# Reset database (wipes all data)
pnpm --filter @helping-hands/database db:reset
```
