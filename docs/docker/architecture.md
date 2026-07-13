# Docker Architecture

How HelpingHands' three apps (`api`, `web`, `admin`) are containerized, and why the same three Dockerfiles serve both local development and production.

This supersedes the Docker-related parts of [08-docker.md](../08-docker.md) and [09-production.md](../09-production.md), which describe an earlier, pre-hot-reload setup.

---

## Design goals

1. **One Dockerfile per app** (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/admin/Dockerfile`) that works for both dev and prod — no parallel `Dockerfile.dev`.
2. **Minimal, non-root production images.**
3. **Fast, hot-reloading local development** with the real pnpm workspace, not a stripped-down dev container.
4. **No change to how images are built and deployed in CI/CD** ([.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)) — this work only changes what's *inside* the Dockerfiles and compose files, not the pipeline that builds/pushes/deploys them.

---

## Multi-stage build layout

Every Dockerfile follows the same stage graph:

```
base ──▶ deps ──┬──▶ dev            (docker-compose.yml only)
                 └──▶ builder ──▶ runner   (production — CI builds this, untargeted)
```

| Stage | Purpose |
|---|---|
| `base` | Node 20 Alpine + pnpm, nothing app-specific |
| `deps` | Installs the full pnpm workspace (`--frozen-lockfile`) — only `package.json` files are copied in, so this layer caches across source changes |
| `dev` | Extends `deps`. No app source is baked in — `docker-compose.yml` bind-mounts the repo over it at runtime and runs the app's watch-mode dev script |
| `builder` | Extends `base`, copies the full repo, generates the Prisma client, runs the production build (`nest build` / `next build`) |
| `runner` | Extends `base`, copies only the compiled build output + production `node_modules` from `builder`. This is the image CI pushes to GHCR and the only stage referenced in `docker-compose.prod.yml` |

Because `runner` is the last stage in each file, `docker build` (and GitHub Actions' `docker/build-push-action`, which doesn't pass `--target`) still produces the production image exactly as before — the CI/CD pipeline needed no changes. `docker-compose.yml` explicitly builds `target: dev`.

---

## Why a `dev` stage instead of running `runner` locally

Before this change, `docker-compose.yml` built the same multi-stage file and (with no `target` specified) landed on `runner` — a full production build with no source mount. Editing code did nothing until you ran `docker compose up --build` again.

The `dev` stage flips this: it has dependencies installed but no source baked in. `docker-compose.yml` bind-mounts the entire repo at `/app` and the container runs `nest start --watch` / `next dev`, so file edits on the host are picked up immediately inside the container — see [development.md](development.md).

---

## Why `runner` still needs `builder`, not `dev`

Production images are built by CI from a clean checkout with no bind mount, so they need the actual compiled output (`apps/api/dist`, `apps/web/.next/standalone`, etc.) baked in — that's what `builder` produces and `runner` copies out of. `dev` never compiles anything; it only exists to be bind-mounted over.

---

## Prisma across the stages

`packages/database/prisma/schema.prisma` is the single source of truth. It's generated (`prisma generate`) in:

- `builder`, at image build time, before `nest build` — the compiled output only works with a matching client.
- `dev`, at **container start** (see each Dockerfile's `dev`-stage `CMD`) — because the schema comes from the bind-mounted host filesystem and can change without a rebuild, regenerating on every start keeps the client in sync with whatever's on disk.

`prisma migrate deploy` (applying migrations) never runs inside the image build — it runs against the real database, so it's a deploy-time step. See [deployment.md](deployment.md).

---

## Runtime users

| App | Prod (`runner`) user | Why |
|---|---|---|
| `web`, `admin` | `nextjs` (uid 1001), set at build time | Static Next.js output, no writable volumes — a plain `USER` instruction is enough |
| `api` | starts as root, drops to `nestjs` (uid 1001) via `docker-entrypoint.sh` | Owns the persistent `uploads` named volume, which had files written by root before this change. The entrypoint `chown`s it and then `exec`s `su-exec nestjs "$@"` — see [production.md](production.md) for why this matters |

`dev`-stage containers run as root (the default) — they're local-only, never pushed anywhere, and running as root avoids UID-mismatch friction with bind-mounted host files.

---

## Networking

```
Internet ──▶ nginx (host, :80/:443) ──▶ 127.0.0.1:{4000,3200,3001} ──▶ containers
                                                                          │
                                                     api ──▶ postgres, redis (compose network)
                                                     web, admin ──▶ api (compose network, http://api:4000)
```

In production, only nginx (running on the host, outside Docker) is reachable from the internet; every container port is bound to `127.0.0.1` in `docker-compose.prod.yml`. See [deployment.md](deployment.md) for the nginx + TLS setup.

---

## Compose files at a glance

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` |
|---|---|---|
| api/web/admin source | `build:`, `target: dev`, bind-mounted | `image:` pulled from GHCR (`runner` stage) |
| Hot reload | Yes | N/A (immutable image) |
| Ports | Published on all interfaces (`4000:4000`) | Bound to loopback only (`127.0.0.1:4000:4000`) |
| `POSTGRES_PASSWORD` | Hardcoded `password` (local-only) | `${POSTGRES_PASSWORD}` from `.env` |
| Healthchecks | postgres, redis, api, web, admin | postgres, redis, api, web, admin |
