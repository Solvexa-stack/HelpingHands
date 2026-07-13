# Production Images

What `docker-compose.prod.yml` runs, and the guarantees the `runner` stage of each Dockerfile provides. For the actual deploy procedure (nginx, TLS, CI/CD), see [deployment.md](deployment.md).

---

## Image contents

All three `runner` stages copy **only** what's needed to run — no source, no dev dependencies, no build tooling:

| App | Copied into `runner` |
|---|---|
| `api` | `dist/`, production `node_modules`, `packages/database/prisma` (schema + migrations, needed by `prisma migrate deploy`) |
| `web`, `admin` | Next.js `standalone` output (`next build` already tree-shook this to its own minimal `node_modules`) + `.next/static` + (web only) `public/` |

None of the three images contain `pnpm`, TypeScript, or a copy of the monorepo — only `web`/`admin`'s `builder` stage needs pnpm/TS, and it's discarded.

---

## Non-root and the `uploads` volume

`web` and `admin` have no persistent state, so they just `USER nextjs` at the end of the Dockerfile — standard.

`api` is different: it owns the `uploads` named volume, and **that volume has existed since before this image ran as non-root** — files in it are root-owned. Simply adding `USER nestjs` would have made the API unable to write new uploads under any pre-existing root-owned subdirectory on the very next deploy.

Instead, `apps/api/docker-entrypoint.sh` runs as root (the image's default), fixes ownership, then drops privilege:

```sh
#!/bin/sh
set -e
if [ -d /app/uploads ]; then
  chown -R nestjs:nodejs /app/uploads
fi
exec su-exec nestjs "$@"
```

This is the same pattern official images (Postgres, Grafana, etc.) use to reconcile "must start as root to fix volume permissions" with "must not run the actual app as root." It's idempotent — once everything's owned by `nestjs`, the `chown -R` is a fast no-op — so it runs on every container start with no manual intervention required, including the very first deploy after this change lands.

The actual Node process (`node apps/api/dist/main`) always runs as `nestjs` (uid 1001), never root. `docker compose exec api <cmd>` (e.g. running migrations) still runs as root by default, since `exec` doesn't inherit the entrypoint's dropped privilege — that's intentional and matches the existing CI migration step.

---

## Health checks

Each `runner` stage bakes in a `HEALTHCHECK`, and `docker-compose.prod.yml` additionally declares one per service (compose-level config takes precedence, but having both means the images are self-describing even outside this compose file, e.g. under a different orchestrator):

| Service | Check |
|---|---|
| `api` | `GET /api/health` — new, minimal, public, unauthenticated endpoint (`apps/api/src/health/`) |
| `web`, `admin` | `GET /` — any non-error response means the Next.js server is alive and routing |
| `postgres` | `pg_isready` |
| `redis` | `redis-cli ping` |

`web` and `admin` now `depends_on: api: condition: service_healthy` — `docker compose up -d` won't start them until the API is actually answering requests, not just "container started."

`docker compose ps` shows live health status; a service stuck `unhealthy` is your first place to look during an incident, before diving into `docker compose logs`.

---

## Environment variables

Read from `.env` on the host via `env_file: .env` in `docker-compose.prod.yml`. Required production values (see `.env.example` for the full list):

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long random strings, distinct from dev values |
| `POSTGRES_PASSWORD` | Strong, unique — used both to start the `postgres` container and to build `DATABASE_URL` |
| `IMAGE_PREFIX` | Must match the CI workflow's `IMAGE_PREFIX` (`ghcr.io/solvexa-stack/helpinghands`) — this is how `docker-compose.prod.yml` knows which images to pull |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_API_URL`, `NEXT_PUBLIC_WEB_URL` | Public HTTPS URLs — **baked into the `web`/`admin` images at build time** (CI passes them as build args), so changing one of these requires a rebuild, not just a container restart |
| `SMTP_*` | Real provider credentials |

`DATABASE_URL` itself is not read from `.env` for the containers — `docker-compose.prod.yml` constructs it from `POSTGRES_PASSWORD` and the `postgres` service name, so it can't drift from the actual container topology.

---

## Volumes and backup

| Volume | Contents | Backup |
|---|---|---|
| `pgdata` | Postgres data directory | `docker compose exec postgres pg_dump -U postgres helping_hands > backup.sql` |
| `uploads` | Donation-related files uploaded through the API | `docker cp $(docker compose -f docker-compose.prod.yml ps -q api):/app/uploads ./uploads_backup` |

Both are named volumes, so they survive `docker compose down` (but not `docker compose down -v` — never run that in production).

---

## Ports

Every container port in `docker-compose.prod.yml` is bound to `127.0.0.1` (e.g. `127.0.0.1:4000:4000`) — not exposed on the public interface. Only host-level nginx (outside Docker) terminates public traffic and reverse-proxies to these loopback ports. See [deployment.md](deployment.md).

---

## Migrations

`prisma migrate deploy` is a deploy-time step, run against the running `api` container after it and Postgres are up — see the actual command in [deployment.md](deployment.md). It never runs during `docker build`. It only applies already-committed migrations under `packages/database/prisma/migrations/` — it does not create new ones and is safe to run repeatedly (a no-op if nothing's pending).

---

## Security hardening checklist

- [ ] All production secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`, SMTP creds) are unique to production, never reused from `.env.example`
- [ ] `.env` on the server is not committed to git and has restrictive file permissions (`chmod 600`)
- [ ] Firewall allows only 22/80/443 publicly; 4000/3200/3001/5432/6379 stay loopback-only (already enforced by the `127.0.0.1:` port bindings above, but keep `ufw`/`iptables` as defense in depth)
- [ ] `@nestjs/throttler` limits (in `app.module.ts`) match expected traffic
- [ ] Automated daily `pgdata` backups off-box, not just on the same disk
- [ ] Disk usage on the `uploads` volume is monitored
