# Local Development with Docker

Run the full stack — Postgres, Redis, and all three apps with hot reload — in containers. See [architecture.md](architecture.md) for why this works the way it does.

If you'd rather run Node natively and only containerize the database, see [07-local-setup.md](../07-local-setup.md); `docker compose up postgres redis -d` on its own still works for that workflow.

---

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

First run installs the full pnpm workspace inside the image (a couple of minutes); subsequent starts reuse that layer and just start containers.

Then, in a separate terminal, apply migrations and seed data:

```bash
docker compose exec api pnpm --filter @helping-hands/database db:migrate:dev
docker compose exec api pnpm --filter @helping-hands/database db:seed
```

| URL | Service |
|---|---|
| http://localhost:3200 | Public website |
| http://localhost:3001 | Admin dashboard |
| http://localhost:4000/api/docs | Swagger UI |
| http://localhost:4000/api/health | API liveness check |
| localhost:5432 | PostgreSQL |
| localhost:6379 | Redis |

---

## How hot reload works

`docker-compose.yml` builds each app's `dev` Dockerfile stage (deps installed, no source baked in), then:

```yaml
volumes:
  - .:/app                              # whole repo, live
  - /app/node_modules                   # anonymous volumes: keep the
  - /app/apps/api/node_modules          # image's installed deps instead of
  - /app/apps/web/node_modules          # letting the bind mount replace
  - /app/apps/admin/node_modules        # them with the host's (probably
  - /app/packages/database/node_modules # absent) node_modules
```

The bind mount (`.:/app`) makes host edits visible in the container instantly. The anonymous volumes sit on top of specific `node_modules` subpaths so they *don't* get overwritten by the bind mount — Docker fills each anonymous volume from the image the first time the container is created, so what ends up there is whatever `pnpm install` produced at build time.

`api` runs `nest start --watch`; `web`/`admin` run `next dev` — both pick up file changes without a restart.

---

## When you *do* need to rebuild

Anonymous volumes for `node_modules` persist across `docker compose up`/`down`, but not across a rebuild. Rebuild the relevant service when:

- You add/remove/upgrade a dependency (`package.json` or `pnpm-lock.yaml` changed):
  ```bash
  docker compose up --build api   # or web / admin
  ```
- You want a fully clean `node_modules` (e.g. suspect a stale/corrupt anonymous volume):
  ```bash
  docker compose down
  docker compose build --no-cache api
  docker compose up
  ```

You do **not** need to rebuild for ordinary source or `packages/database/prisma/schema.prisma` edits.

---

## Prisma in dev

The `dev` stage's `CMD` runs `pnpm --filter @helping-hands/database db:generate` before starting the app on every container start, so the generated client always matches whatever schema is currently on disk. After changing the schema and creating a migration:

```bash
docker compose exec api pnpm --filter @helping-hands/database db:migrate:dev
```

This runs `prisma migrate dev` against the `postgres` service, writes a new migration under `packages/database/prisma/migrations/`, and regenerates the client in-place — no restart needed, but if the client felt stale, `docker compose restart api` picks it up cleanly (the `CMD` regenerates again on boot).

---

## Common commands

```bash
# Start everything in the background
docker compose up -d

# Only the database + Redis, for native `pnpm dev`
docker compose up postgres redis -d

# Logs
docker compose logs -f
docker compose logs -f api

# Shell into a running container
docker compose exec api sh

# Run a one-off workspace command
docker compose exec api pnpm --filter @helping-hands/api lint

# Stop (data preserved)
docker compose down

# Stop and wipe volumes (drops the dev DB and uploads)
docker compose down -v

# Container health
docker compose ps
```

---

## Troubleshooting

**Port already in use** — something outside Docker (a native `pnpm dev`) is holding 4000/3200/3001/5432/6379:
```bash
docker compose down
lsof -ti:4000 | xargs kill -9
docker compose up -d
```
See also the memory note on two stacks fighting over the same ports if `pnpm dev` and `docker compose` are both running.

**"Cannot find module" after `pnpm add`** — the anonymous `node_modules` volume is stale relative to a new dependency; rebuild that service (see above).

**API can't reach Postgres** — `docker-compose.yml` already points `DATABASE_URL` at the `postgres` service name, not `localhost`; this only bites you if you've overridden `DATABASE_URL` in your `.env` to a `localhost` value, since `env_file: .env` is read before the compose-level `environment:` override... actually the reverse: compose's `environment:` takes precedence over `env_file`, so the `postgres` hostname always wins inside containers. If you still see connection errors, confirm the `postgres` container is healthy (`docker compose ps`).

**Health check failing right after `docker compose up`** — the `start_period: 40s` accounts for `pnpm install`-then-boot on a cold container; if it's still unhealthy after that, check `docker compose logs api` for an actual startup error rather than assuming the health check itself is broken.

**`sh: next: not found` / `web` or `admin` stuck restarting, one time only, right after pulling this Docker rework** — you're hitting a Compose gotcha, not a broken image. Compose reuses a service's anonymous volumes across `docker compose up` recreations by default. If a `web`/`admin`/`api` container was ever created against an *older* image that didn't populate `/app/apps/<app>/node_modules` at that mount point (e.g. an old production-only image built before this Docker rework), the anonymous volume it created there is empty — and every later `up` keeps reusing that same empty volume even after you rebuild with a correct image, because from Compose's point of view nothing about the mount *declaration* changed. Force fresh anonymous volumes once to clear it:
```bash
docker compose up -d --build --renew-anon-volumes
```
This only affects anonymous `node_modules` volumes; the named `pgdata`/`uploads` volumes (and your data) are untouched. You should not need `--renew-anon-volumes` again after this one-time fix — it's only required when a service's image previously existed without the current `node_modules` layout at that path.
