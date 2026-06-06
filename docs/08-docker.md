# Docker — Full Stack Local with Docker Compose

Use Docker Compose when you want to run the entire stack (API + web + admin + database + Redis) inside containers, without installing Node or pnpm locally.

---

## Services

| Service | Image / Build | Port | Description |
|---------|--------------|------|-------------|
| `postgres` | postgres:16-alpine | 5432 | PostgreSQL database |
| `redis` | redis:7-alpine | 6379 | Redis cache |
| `api` | `apps/api/Dockerfile` | 4000 | NestJS REST API |
| `web` | `apps/web/Dockerfile` | 3000 | Next.js public website |
| `admin` | `apps/admin/Dockerfile` | 3001 | Next.js admin dashboard |

**Volumes:**
- `pgdata` — PostgreSQL data directory (persistent across restarts)
- `uploads` — File uploads shared between the API container and the host

---

## Quick Start

### 1. Copy environment file

```bash
cp .env.example .env
```

For Docker Compose, update the database host from `localhost` to the service name `postgres`:

```env
DATABASE_URL="postgresql://postgres:password@postgres:5432/helping_hands?schema=public"
```

### 2. Build and start everything

```bash
docker compose up --build
```

First run downloads images and builds all three app images (~3–5 min). Subsequent starts are fast.

### 3. Run migrations and seed

In a separate terminal (while containers are running):

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npx ts-node ../../packages/database/prisma/seed.ts
```

Or from the host if you have Node installed:

```bash
pnpm --filter @helping-hands/database db:migrate
pnpm --filter @helping-hands/database db:seed
```

---

## Common Commands

```bash
# Start all services in the background
docker compose up -d

# Start only the database and Redis (for native Node dev)
docker compose up postgres redis -d

# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f web

# Stop all containers (data preserved)
docker compose down

# Stop and remove all volumes (wipes DB data)
docker compose down -v

# Rebuild a single service after code changes
docker compose up --build api

# Open a shell inside a running container
docker compose exec api sh
docker compose exec postgres psql -U postgres -d helping_hands
```

---

## Accessing Services

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Public website |
| http://localhost:3001 | Admin dashboard |
| http://localhost:4000/api/docs | Swagger UI |
| localhost:5432 | PostgreSQL (connect with any DB client) |
| localhost:6379 | Redis |

---

## docker-compose.yml Overview

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: helping_hands
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: ...

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck: ...

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    ports: ["4000:4000"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    volumes: [uploads:/app/uploads]

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [api]

  admin:
    build: { context: ., dockerfile: apps/admin/Dockerfile }
    ports: ["3001:3001"]
    env_file: .env
    depends_on: [api]

volumes:
  pgdata:
  uploads:
```

---

## Rebuilding After Code Changes

Docker images are built once; they do not hot-reload. After changing source code:

```bash
# Rebuild and restart a specific service
docker compose up --build api

# Or rebuild all
docker compose up --build
```

For active development, use the native Node setup (see [07-local-setup.md](07-local-setup.md)) and only run the database in Docker:

```bash
docker compose up postgres redis -d
pnpm dev
```

---

## Troubleshooting

### Port conflict

Stop any local process using the same port:
```bash
docker compose down
lsof -ti:4000 | xargs kill -9
docker compose up -d
```

### Database connection refused from API container

Make sure `DATABASE_URL` uses `postgres` (service name) not `localhost`:
```env
DATABASE_URL="postgresql://postgres:password@postgres:5432/helping_hands?schema=public"
```

### "Cannot find module" errors after code change

Rebuild the image — the old layer is cached:
```bash
docker compose up --build api
```

### Viewing upload files

The `uploads` volume is mounted at `/app/uploads` inside the API container. To inspect:
```bash
docker compose exec api ls /app/uploads
```
