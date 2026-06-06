# Commands Reference

All commands run from the **repo root** unless noted otherwise.

---

## LOCAL (Native Node)

### Environment

```bash
cp .env.example .env
```

Edit `.env` — minimum values for local:

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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@helpinghands.org
SMTP_PASS=your-smtp-password
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"

# ─── Next.js Public Website ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Next.js Admin ───────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api
```

---

### Install

```bash
# Install all workspace dependencies
pnpm install
```

---

### Database

```bash
# Start PostgreSQL only (Docker required)
docker compose up postgres -d

# Apply migrations (dev — creates migration files)
pnpm --filter @helping-hands/database db:migrate:dev

# Apply migrations (prod-style apply without creating files)
pnpm --filter @helping-hands/database db:migrate

# Generate Prisma client after schema changes
pnpm --filter @helping-hands/database db:generate
# or via root alias:
pnpm db:generate

# Reset DB — wipes all data, re-runs all migrations
pnpm --filter @helping-hands/database db:reset

# Open Prisma Studio (visual browser at http://localhost:5555)
pnpm db:studio

# Create a new migration after editing schema.prisma
pnpm --filter @helping-hands/database db:migrate:dev -- --name your_migration_name
```

---

### Seed

```bash
# Seed test accounts and sample data
pnpm --filter @helping-hands/database db:seed
# or via root alias:
pnpm db:seed
```

Seeded accounts:

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

---

### Email

Email is sent by the API via Nodemailer. For local testing you can use a catch-all SMTP service like [Mailpit](https://github.com/axllent/mailpit) or [Mailtrap](https://mailtrap.io).

```bash
# Option A — Mailpit (Docker, catches all outgoing email locally)
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit

# Then set in .env:
# SMTP_HOST=localhost
# SMTP_PORT=1025
# SMTP_SECURE=false
# SMTP_USER=   (leave blank)
# SMTP_PASS=   (leave blank)
# Open Mailpit inbox at http://localhost:8025

# Option B — Mailtrap (cloud sandbox, free tier)
# SMTP_HOST=sandbox.smtp.mailtrap.io
# SMTP_PORT=587
# SMTP_USER=<your mailtrap username>
# SMTP_PASS=<your mailtrap password>
```

---

### Start Apps

```bash
# Start all three apps in parallel (API + Web + Admin) with hot reload
pnpm dev

# ─── Individual apps ──────────────────────────────────────────────────────────
pnpm --filter @helping-hands/api dev        # API      → http://localhost:4000
pnpm --filter @helping-hands/web dev        # Web      → http://localhost:3000
pnpm --filter @helping-hands/admin dev      # Admin    → http://localhost:3001
```

---

### Build (local)

```bash
# Build all apps
pnpm build

# Build individual apps
pnpm --filter @helping-hands/api build
pnpm --filter @helping-hands/web build
pnpm --filter @helping-hands/admin build
```

---

### Lint & Format

```bash
pnpm lint
pnpm format
```

---

---

## DOCKER (Full Stack in Containers)

### Environment

Update `DATABASE_URL` to use the Docker service name `postgres` (not `localhost`):

```env
# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=development
APP_PORT=4000
APP_URL=http://localhost:4000
WEB_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:password@postgres:5432/helping_hands?schema=public"

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=any-local-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=any-local-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# ─── Storage ─────────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ─── Email (SMTP) ────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@helpinghands.org
SMTP_PASS=your-smtp-password
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"

# ─── Next.js Public Website ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Next.js Admin ───────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000/api
```

---

### Start

```bash
# Build images and start all services (first run)
docker compose up --build

# Start in background
docker compose up --build -d

# Start only DB + Redis (run apps natively for hot reload)
docker compose up postgres redis -d

# Stop all containers (data preserved)
docker compose down

# Stop and wipe all volumes (deletes DB data)
docker compose down -v
```

---

### Database

```bash
# Apply migrations inside running API container
docker compose exec api npx prisma migrate deploy

# Generate Prisma client inside container
docker compose exec api npx prisma generate

# Open psql shell on the Postgres container
docker compose exec postgres psql -U postgres -d helping_hands

# Connect to DB from host (requires psql installed locally)
psql postgresql://postgres:password@localhost:5432/helping_hands
```

---

### Seed

```bash
# Seed inside the running API container
docker compose exec api npx ts-node ../../packages/database/prisma/seed.ts
```

---

### Email

```bash
# Run Mailpit catch-all alongside the stack
docker compose up postgres redis mailpit -d

# Add mailpit service to docker-compose.yml (if not present):
# mailpit:
#   image: axllent/mailpit
#   ports:
#     - "1025:1025"   # SMTP
#     - "8025:8025"   # Web UI

# Then set in .env:
# SMTP_HOST=mailpit
# SMTP_PORT=1025
# SMTP_SECURE=false
# Open inbox at http://localhost:8025
```

---

### Logs & Status

```bash
# Live logs all services
docker compose logs -f

# Logs for a specific service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f admin
docker compose logs -f postgres

# Container status and health
docker compose ps

# Open shell in a container
docker compose exec api sh
docker compose exec web sh
```

---

### Rebuild After Code Changes

```bash
# Rebuild and restart all services
docker compose up --build -d

# Rebuild one service only (no downtime on others)
docker compose up --build --no-deps -d api
docker compose up --build --no-deps -d web
docker compose up --build --no-deps -d admin
```

---

---

## PRODUCTION (VPS / Server)

### Environment

Replace every placeholder with real production values:

```env
# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
APP_PORT=4000
APP_URL=https://api.yourdomain.com
WEB_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com

# ─── Database ────────────────────────────────────────────────────────────────
# Use service name "postgres" (not localhost) inside Docker network
DATABASE_URL="postgresql://postgres:STRONG_RANDOM_PASSWORD@postgres:5432/helping_hands?schema=public"

# ─── JWT ─────────────────────────────────────────────────────────────────────
# Use long random strings — never reuse dev values
JWT_SECRET=replace-with-64-char-random-string
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-another-64-char-random-string
JWT_REFRESH_EXPIRES_IN=7d

# ─── Storage ─────────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ─── Email (SMTP) ────────────────────────────────────────────────────────────
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-real-smtp-password
MAIL_FROM="HelpingHands <noreply@yourdomain.com>"

# ─── Next.js Public Website ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# ─── Next.js Admin ───────────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_API_URL=https://api.yourdomain.com/api
```

---

### Deploy (First Time)

```bash
# On the server
git clone https://github.com/your-org/HelpingHands.git /opt/helpinghands
cd /opt/helpinghands

cp .env.example .env
nano .env                          # fill in production values

docker compose up --build -d
```

---

### Database

```bash
# Apply all pending migrations
docker compose exec api npx prisma migrate deploy

# Open psql shell on production DB
docker compose exec postgres psql -U postgres -d helping_hands

# Check which migrations have been applied
docker compose exec postgres psql -U postgres -d helping_hands \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"
```

---

### Seed

```bash
# Run seed ONLY on first deploy — it creates the default admin account
docker compose exec api npx ts-node ../../packages/database/prisma/seed.ts
```

> **Warning:** Running seed a second time may create duplicate records. Only run once on a fresh database.

---

### Email

Test that email delivery works from the server:

```bash
# Send a test email via the API's forgot-password endpoint
curl -X POST https://api.yourdomain.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@helpinghands.org"}'

# Check the server logs for SMTP errors
docker compose logs -f api | grep -i smtp
docker compose logs -f api | grep -i mail
```

---

### Update / Redeploy

```bash
cd /opt/helpinghands
git pull origin main

# Rebuild changed images
docker compose up --build -d

# Apply any new migrations
docker compose exec api npx prisma migrate deploy
```

---

### Backup

```bash
# Database dump (run from server)
docker compose exec -T postgres pg_dump -U postgres helping_hands \
  > /backups/db_$(date +%Y%m%d_%H%M%S).sql

# Restore from dump
docker compose exec -T postgres psql -U postgres helping_hands \
  < /backups/db_20240601_120000.sql

# Backup uploads volume
docker cp $(docker compose ps -q api):/app/uploads /backups/uploads_$(date +%Y%m%d)

# Automate with cron (runs daily at 02:00)
# Add to /etc/cron.d/helpinghands:
# 0 2 * * * root cd /opt/helpinghands && \
#   docker compose exec -T postgres pg_dump -U postgres helping_hands \
#   > /backups/db_$(date +\%Y\%m\%d).sql
```

---

### Logs & Monitoring

```bash
# Live logs all services
docker compose logs -f

# API logs only
docker compose logs -f api

# Filter for errors
docker compose logs api | grep -i error

# Container status
docker compose ps

# Restart a crashed service
docker compose restart api
```

---

## Quick Reference Table

| Task | Local | Docker | Production |
|------|-------|--------|------------|
| Install deps | `pnpm install` | *(inside image)* | *(inside image)* |
| Start all | `pnpm dev` | `docker compose up --build -d` | `docker compose up --build -d` |
| Start API | `pnpm --filter @helping-hands/api dev` | `docker compose up api` | — |
| Start Web | `pnpm --filter @helping-hands/web dev` | `docker compose up web` | — |
| Start Admin | `pnpm --filter @helping-hands/admin dev` | `docker compose up admin` | — |
| DB migrate (dev) | `pnpm --filter @helping-hands/database db:migrate:dev` | `docker compose exec api npx prisma migrate deploy` | `docker compose exec api npx prisma migrate deploy` |
| DB generate | `pnpm --filter @helping-hands/database db:generate` | `docker compose exec api npx prisma generate` | — |
| DB reset | `pnpm --filter @helping-hands/database db:reset` | `docker compose down -v && docker compose up -d` | **Never in prod** |
| DB seed | `pnpm --filter @helping-hands/database db:seed` | `docker compose exec api npx ts-node ../../packages/database/prisma/seed.ts` | Same as Docker (once only) |
| DB studio | `pnpm db:studio` | `docker compose exec api npx prisma studio` | — |
| DB backup | — | — | `docker compose exec -T postgres pg_dump -U postgres helping_hands > backup.sql` |
| View logs | Terminal output | `docker compose logs -f` | `docker compose logs -f` |
| Rebuild one app | — | `docker compose up --build --no-deps -d api` | `docker compose up --build --no-deps -d api` |
