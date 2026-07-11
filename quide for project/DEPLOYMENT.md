# Deployment Guide

> **Audience:** DevOps/infrastructure engineers, technical leads standing up a new environment.
> **Ground truth:** verified directly against `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/admin/Dockerfile`, `.github/workflows/e2e.yml`, `.env.example`, and the `package.json` scripts in the repo root and `packages/database`. Several older docs in this repo (`docs/07-local-setup.md`, `docs/08-docker.md`, `LOCAL_SETUP.md`, `DEV_TEAM_SETUP.md`, `TEAM_SETUP.md`) disagree with the real configuration — this document supersedes them; discrepancies are called out explicitly in §9.

---

## 1. Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.0.0 | enforced by root `package.json` `engines` |
| pnpm | ≥ 9.0.0 (`9.4.0` pinned via `packageManager`) | `npm install -g pnpm` if missing |
| PostgreSQL | 16 (via Docker: `postgres:16-alpine`) | or your own instance ≥ 14 |
| Redis | 7 (via Docker: `redis:7-alpine`) | used for Bull job queues (notifications, email) |
| Docker + Docker Compose | any recent version | for the containerized path |

---

## 2. Ports — the authoritative table

| Service | Port | Source of truth |
|---|---|---|
| API | **4000** | `docker-compose.yml`, `apps/api/package.json` (`nest start`), `.env.example` (`APP_PORT=4000`) |
| Admin app | **3001** | `docker-compose.yml`, `apps/admin/Dockerfile` (`EXPOSE 3001`) |
| Public web app | **3200** | `docker-compose.yml` (`3200:3200`), `apps/web/Dockerfile` (`EXPOSE 3200`, `ENV PORT=3200`), `apps/web/package.json` (`next dev -p 3200`, `next start -p 3200`) |
| PostgreSQL | 5432 | `docker-compose.yml` |
| Redis | 6379 | `docker-compose.yml` |

> ⚠️ **Do not trust the web app's port number in `docs/07-local-setup.md`, `docs/08-docker.md`, `LOCAL_SETUP.md`, or `DEV_TEAM_SETUP.md` (all say 3000) or `TEAM_SETUP.md` (says 3002).** None of the four match the actual configuration. The web app dev port has apparently changed at least twice without every doc being updated. **3200 is correct today.** This is tracked as a documentation debt item in `ROADMAP.md`.

Swagger/OpenAPI UI: `http://localhost:4000/api/docs`. All real API routes live under `http://localhost:4000/api/v1/*` (global prefix `api` + URI versioning, default version `1`).

---

## 3. Environment variables

Copy `.env.example` to `.env` at the repo root, then fill in real values before anything beyond local dev.

### 3.1 Core

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `APP_PORT`, `APP_URL` | API port and its externally-reachable base URL |
| `WEB_URL`, `ADMIN_URL` | Used for CORS allow-listing and building links (invite emails, QR donation URLs) |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?schema=public` |
| `TEST_DATABASE_URL` | Optional override for e2e tests; defaults to `helping_hands_test` on the same server. **Never point this at your real data — e2e tests truncate it.** |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Auth token signing. **Rotate away from the example placeholders before any non-local use.** |
| `UPLOAD_DIR`, `MAX_FILE_SIZE` | Local-disk file storage (`./uploads` by default, served at `/uploads/*`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email. Without working credentials, invite/reset flows fall back to showing the link on-screen (dev/pilot-test convenience — disabled in production, meaning email becomes mandatory once `NODE_ENV=production` semantics are enforced by your deployment). |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` | apps/web build-time config |
| `NEXT_PUBLIC_ADMIN_API_URL` | apps/admin build-time config |
| `INTERNAL_API_URL` | Used by the `web` container to reach `api` over the Docker network (`http://api:4000/api`) — set inline in `docker-compose.yml`; **not currently listed in `.env.example`**, worth adding if you run web outside Compose. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Online payments. Ships with placeholder `sk_test_...` values — replace before any real transaction. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` | Online payments (`sandbox`/`live`) |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_CANCEL_URL` | Redirect targets after checkout |
| `REDIS_HOST`, `REDIS_PORT` | Bull queue backend |

### 3.2 Feature flags — read this before deploying

All of these are read live from `process.env` (no restart-caching beyond normal process env loading). Defaults below are `.env.example`'s current values — **not necessarily what you want in production**; each is a migration-era flag with a recorded owner and removal wave (Wave 8) per `workspaceroadmap/09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md`.

| Flag | Default | Effect | Rollback |
|---|---|---|---|
| `SOFT_DELETE_ENFORCED` | `false` | `true` = new tables soft-delete (`deletedAt`/`deletedBy`) instead of hard-deleting. Currently OFF pending a staging soak. | flip to `false` |
| `TENANCY_ENFORCED` | `true` | Multi-organization data isolation (see `SYSTEM_ARCHITECTURE.md` §4.2). **Do not run a multi-tenant deployment with this off.** | flip to `false` (Wave 1 behavior — no isolation) |
| `POLICY_ENFORCED` | `true` | ABAC/policy engine is the real authorization gate instead of the legacy `RolesGuard`. | flip to `false` |
| `WORKFLOW_ENFORCED` (+ `WORKFLOW_SERVICES`) | `true` (unset) | Workflow engine actually drives lifecycle transitions. `WORKFLOW_SERVICES=study,voting,projects,execution` can narrow enforcement to specific services for staged rollout. **Not yet in `.env.example` as a real key — only mentioned in a comment; add it explicitly if you use it.** | flip `WORKFLOW_ENFORCED` to `false` |
| `TREASURY_LEDGER_READS` | `true` | Project financial-summary reads come from the ledger instead of the legacy transaction journal. | flip to `false` |
| `PROJECT_FUND_REQUIRED` | `false` | `true` = project creation requires a `fundId`. Flip only after confirming the fund-of-record backfill is complete in your environment. | flip to `false` |
| `ORG_SELF_REGISTRATION` | `allowlist` | `off` = closed; `allowlist` = only emails in `ORG_REGISTRATION_ALLOWLIST` may self-register; `open` = general availability (post-pilot). Verification (documents + Board decision) always runs regardless of this flag. | flip to `off` or `allowlist` |
| `ORG_REGISTRATION_ALLOWLIST` | *(empty)* | Comma-separated contact emails allowed to self-register when the flag above is `allowlist`. |  |
| `ORG_TYPES_ENABLED` | `ngo,board,municipality,youth_team` | Organization types creatable via the platform admin API. | narrow the list |

---

## 4. Database — migrations, generate, seed

Run from `packages/database` (or via the root turbo-wrapped equivalents shown alongside):

| Purpose | Command (from `packages/database`) | Root equivalent |
|---|---|---|
| Generate Prisma client | `pnpm db:generate` | `pnpm db:generate` |
| **Development** migration (interactive, creates new migration files) | `pnpm db:migrate:dev` | — |
| **Production** migration (non-interactive, applies existing migrations) | `pnpm db:migrate` (wraps `prisma migrate deploy`) | `pnpm db:migrate` |
| Seed | `pnpm db:seed` (`ts-node prisma/seed.ts`) | `pnpm db:seed` |
| **Destructive** reset (`prisma migrate reset --force`) | `pnpm db:reset` | — |
| Prisma Studio (DB browser) | `pnpm studio` | `pnpm db:studio` |
| One-off Wave 1 identity backfill | `pnpm db:backfill:w1` | — |

`pnpm db:seed` is idempotent and re-runnable — it chains the Wave 1/4/5/6/7 backfills/seeds in-process (upserts by unique key), so re-running it against an already-seeded database is safe and will not duplicate rows. It **will** fail loudly (by design) if data-integrity gates aren't met — e.g. the Wave 6 category-coverage gate hard-fails if any project or study template ends up with no taxonomy node.

There is **no compiled `dist/seed.js`** produced by the API build — the seed script only runs via `ts-node` against the TypeScript source. `docs/09-production.md`'s instruction (`docker compose exec api node dist/seed.js`) is stale and will not work against the actual built `api` image.

---

## 5. Local development (native Node, DB+Redis in Docker)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# edit .env — at minimum set real JWT secrets if this isn't purely throwaway local dev

# 3. Start Postgres and Redis only
docker compose up postgres redis -d

# 4. Migrate and seed
cd packages/database
pnpm db:migrate:dev
pnpm db:seed
cd ../..

# 5. Start all three apps
pnpm dev
```

| App | URL |
|---|---|
| API | http://localhost:4000 (Swagger: `/api/docs`) |
| Admin | http://localhost:3001 |
| Public web | **http://localhost:3200** |

---

## 6. Full Docker Compose deployment

```bash
# From repo root, with .env configured
docker compose up -d --build
```

`docker-compose.yml` defines exactly five services — `postgres`, `redis`, `api`, `web`, `admin` — no other compose file variants exist (no `.override.yml`/`.prod.yml`). All `restart: unless-stopped`. Named volumes: `pgdata` (Postgres data), `uploads` (shared with the `api` container's `/app/uploads`).

**The API container does not self-migrate.** After first bringing up Postgres, you must run migrations + seed as a separate step:

```bash
docker compose up -d postgres redis
# wait for postgres healthcheck to pass
docker compose run --rm api sh -c "cd /app && npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma"
# then seed (see the note in §4 about ts-node availability inside the built image —
# verify this against your actual built image; the safest approach for a first
# deploy is running the seed from your local machine against the same DATABASE_URL,
# or from a container that has the full devDependencies, not the slim `api` runner)
docker compose up -d api admin web
```

> **Verify before you rely on it in production:** the `api` image's final `runner` stage copies `apps/api/dist`, production `node_modules`, and the Prisma `prisma/` folder (which does include `seed.ts`, since the whole directory is copied) — but `ts-node` and the `prisma` CLI are devDependencies of `packages/database`, not runtime dependencies of `apps/api`, so whether `npx ts-node prisma/seed.ts` actually works inside the built `api` container is **unverified** and should be tested in your environment rather than assumed. The safest known-working path is running `pnpm --filter @helping-hands/database db:migrate` and `db:seed` from a machine/CI runner with the full dev toolchain and the same `DATABASE_URL` the container uses.

**Dockerfiles** (all three: `apps/{api,web,admin}/Dockerfile`) are multi-stage, `node:20-alpine`, pnpm 9.4.0. `web` and `admin` run as a non-root `nextjs` user (uid/gid 1001) using Next.js `standalone` output; `api` currently runs as root (no non-root user configured — worth hardening).

**No Docker `HEALTHCHECK` exists in any of the three app Dockerfiles.** Only `postgres` (`pg_isready`) and `redis` (`redis-cli ping`) have compose-level healthchecks; `api`'s dependents (`web`, `admin`) use plain `depends_on` (start-order only, not a readiness gate) since `api` has no healthcheck to depend on.

---

## 7. Build & typecheck

```bash
pnpm build       # turbo run build — all three apps + packages/database
pnpm typecheck   # turbo typecheck
pnpm lint        # turbo run lint (root) — NOTE: CI only runs this for apps/api, see §8
pnpm test        # unit tests, turbo-orchestrated
pnpm test:e2e    # apps/api e2e suite only (pnpm --filter @helping-hands/api test:e2e)
```

---

## 8. CI (what actually runs today)

Single workflow: `.github/workflows/e2e.yml`, job name **`e2e-regression-suite`** (this exact name is load-bearing — GitHub branch protection on `main` depends on it; renaming the job silently detaches branch protection).

- **Triggers:** every push to `main`, every pull request.
- **Services:** `postgres:16-alpine` + `redis:7-alpine`.
- **Steps:** checkout → pnpm/node setup → `pnpm install --frozen-lockfile` → `prisma generate` → **lint `apps/api` only** → `pnpm test:e2e` (API e2e suite) → on failure, dump the test DB and upload failure artifacts (14-day retention).

**NOT IMPLEMENTED in CI:** no `typecheck` step, no `build` step, no unit-`test` step (only e2e), no lint for `apps/web`/`apps/admin`, and **no deploy/CD job of any kind** — CI never builds or pushes a Docker image. Treat `pnpm build`/`pnpm typecheck`/`pnpm lint` (full) as manual pre-release steps until CI is extended.

---

## 9. Production deployment target

**There is no configured production deployment target in this repository.** No Kubernetes manifests, no Terraform/other IaC, no Fly.io/Railway config, no Heroku `Procfile`. `docs/09-production.md` is a **generic, manual runbook** for "a Linux VPS or any Docker-compatible host" (examples given: DigitalOcean, EC2, Hetzner) — SSH in, `git clone`, `docker compose up --build -d`, manually configure Nginx + Certbot for TLS. It is not automated and not wired to CI.

If you follow that runbook, be aware of these **confirmed inaccuracies** to correct as you go:
- Its Nginx example proxies the public site to `127.0.0.1:3000` — **should be `127.0.0.1:3200`** (see §2).
- Its seed instruction (`docker compose exec api node dist/seed.js`) is stale — see §4/§6.

### Minimal production checklist (manual, until CD exists)
1. Provision a host with Docker + Docker Compose.
2. Clone the repo, create a production `.env` with rotated secrets (never the `.env.example` placeholders — see `BACKUP_RECOVERY.md` §7 for the full secrets checklist).
3. Set `TENANCY_ENFORCED=true`, `POLICY_ENFORCED=true` (do not disable multi-tenant isolation in a real deployment).
4. `docker compose up -d postgres redis`, wait healthy.
5. Run migrations (`prisma migrate deploy`) and seed as described in §6.
6. `docker compose up -d api admin web`.
7. Configure a reverse proxy (Nginx or equivalent) with TLS for all three public-facing ports, proxying to 4000/3001/3200 respectively.
8. Smoke test: log in with all seeded/real accounts; confirm `GET /api/v1/transparency/stats` returns 200 publicly.
9. See §10 for what's still missing before this is pilot-ready.

---

## 10. Health checks & smoke tests

**`/health` or `/healthz` — NOT IMPLEMENTED.** There is no dedicated health endpoint anywhere in `apps/api` (no `@nestjs/terminus`, no health controller). If your load balancer or orchestrator needs a health check today, point it at a real, unauthenticated route instead — e.g. `GET /api/v1/languages` (public, cheap, touches the DB) — until a proper `/health` endpoint is added.

### Manual smoke test (run after every deploy)

1. `GET /api/v1/languages` → 200, returns 3 languages.
2. Log in as each of the four seeded accounts → 200, correct workspace loads.
3. `GET /api/v1/transparency/stats` → 200 (public, no auth).
4. Public web app home page loads, shows the seeded project.
5. Admin app dashboard loads with real numbers.
6. Create a test donation end-to-end (cash or online) and confirm it appears in `/donations`.

---

## 11. Post-deployment verification

After any deploy carrying schema migrations or a feature-flag change:

- Confirm migration count matches expectations (`prisma migrate status` against the target `DATABASE_URL`).
- Re-run the seed's built-in gates by checking its console output for any gate failure (category coverage, ledger reconciliation, tally verification) if you seeded/backfilled as part of this deploy.
- Run the manual smoke test above.
- If you changed a feature flag, re-read its row in §3.2 for what regressed/changed and re-test the affected flow specifically (e.g. flipping `PROJECT_FUND_REQUIRED` — try creating a project with and without a fund).
- Check `/audit` for unexpected `tenancy.bypassed` or policy-denial spikes right after deploy — a sudden spike often indicates a misconfigured flag.

---

## Related documents
- `BACKUP_RECOVERY.md` — backup, restore, rollback, and the pilot-blocking security items that must be resolved before real traffic.
- `SYSTEM_ARCHITECTURE.md` §10 — the full list of NOT IMPLEMENTED items (health checks, CD, RLS, etc.) with context.
- `ADMIN_ACCEPTANCE_TEST.md` §22 — the release sign-off checklist that references this document.
