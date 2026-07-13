# Deployment

End-to-end: pushing a commit to production. Covers the existing CI/CD pipeline ([.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)), the nginx templates ([deploy/nginx/](../../deploy/nginx/)), and TLS. None of these three are changed by the Docker work in this doc set — this page just explains how they fit together with the updated images/compose files from [architecture.md](architecture.md) and [production.md](production.md).

Worked example below uses this deployment's real domains (`bsdfund.tech`, `admin.bsdfund.tech`, `api.bsdfund.tech`); the checked-in nginx templates use `yourdomain.com` placeholders so they stay reusable for other environments.

---

## Pipeline overview

```
git push → workspaceandcenterbox
        │
        ▼
 build-and-push (GitHub Actions, per app: api/web/admin)
   docker buildx build → GHCR
   tags: ${IMAGE_PREFIX}-<app>:latest, :<sha>
        │
        ▼
 deploy (ssh to VPS)
   git reset --hard origin/workspaceandcenterbox   (repo checkout — for compose files, nginx templates, migrations)
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   sleep 10
   docker compose -f docker-compose.prod.yml exec -T api prisma migrate deploy
   docker image prune -f
```

Two things worth calling out about the existing script, unchanged here:
- It deploys on every push to `workspaceandcenterbox` (`concurrency: cancel-in-progress: false`, so overlapping pushes queue rather than race).
- `NEXT_PUBLIC_*` build args come from GitHub Actions **repository variables** (`vars.NEXT_PUBLIC_API_URL` etc.), not secrets — set these under repo Settings → Variables to match the real domains, since they get baked into the `web`/`admin` images at build time (see [production.md](production.md)).

**Optional, not applied:** now that `api` has a real health check, the blind `sleep 10` before running migrations could be replaced with a poll loop on `docker compose ps --format json api` for `"Health":"healthy"`. Left as-is here since editing the deploy workflow wasn't asked for and the current `sleep` already works — worth doing next time that file changes for another reason.

---

## First-time server setup

1. **Docker Engine 24+ and the Compose plugin.**
2. **Clone the repo** to `/opt/helping-hands` (the path the deploy script `cd`s into):
   ```bash
   git clone <repo-url> /opt/helping-hands
   cd /opt/helping-hands
   ```
3. **Configure `.env`** — copy `.env.example`, fill in real secrets, and set the public URLs to the real domains:
   ```env
   NODE_ENV=production
   APP_URL=https://api.bsdfund.tech
   WEB_URL=https://bsdfund.tech
   ADMIN_URL=https://admin.bsdfund.tech
   NEXT_PUBLIC_API_URL=https://api.bsdfund.tech/api
   NEXT_PUBLIC_APP_URL=https://bsdfund.tech
   NEXT_PUBLIC_ADMIN_API_URL=https://api.bsdfund.tech/api
   NEXT_PUBLIC_WEB_URL=https://bsdfund.tech
   IMAGE_PREFIX=ghcr.io/solvexa-stack/helpinghands
   POSTGRES_PASSWORD=<strong random value>
   ```
   The `NEXT_PUBLIC_*` values here only matter for a manual `docker compose -f docker-compose.prod.yml up --build`; the CI pipeline bakes its own copies in from GitHub Actions repo variables (see above) — keep both in sync so a manual rebuild on the box matches what CI ships.
4. **Configure GitHub Actions secrets** (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, optionally `VPS_SSH_PORT`) so the `deploy` job can SSH in.
5. **First image pull + start:**
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```
6. **Apply migrations and seed the initial admin:**
   ```bash
   docker compose -f docker-compose.prod.yml exec -T api \
     ./apps/api/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
   docker compose -f docker-compose.prod.yml exec -T api node dist/seed.js
   ```

---

## nginx + TLS

Copy the three templates from `deploy/nginx/` and replace the placeholder domain:

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx

cp deploy/nginx/web.conf   /etc/nginx/sites-available/helpinghands-web.conf
cp deploy/nginx/admin.conf /etc/nginx/sites-available/helpinghands-admin.conf
cp deploy/nginx/api.conf   /etc/nginx/sites-available/helpinghands-api.conf

# In each file, replace yourdomain.com with the real domain, e.g.:
#   web.conf:   server_name bsdfund.tech www.bsdfund.tech;
#   admin.conf: server_name admin.bsdfund.tech;
#   api.conf:   server_name api.bsdfund.tech;

ln -s /etc/nginx/sites-available/helpinghands-web.conf   /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/helpinghands-admin.conf /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/helpinghands-api.conf   /etc/nginx/sites-enabled/

nginx -t && systemctl reload nginx

certbot --nginx -d bsdfund.tech -d www.bsdfund.tech
certbot --nginx -d admin.bsdfund.tech
certbot --nginx -d api.bsdfund.tech
```

Each template already proxies to the correct loopback port (`3200` web, `3001` admin, `4000` api) and forwards `X-Forwarded-Proto`/`X-Forwarded-For` — required for the API's CORS/cookie logic and Next.js to know the original scheme was HTTPS. `client_max_body_size 15M` in each template must stay ≥ the API's `MAX_FILE_SIZE` env var.

---

## Updating an existing deployment

Normal path is just pushing to `workspaceandcenterbox` — the pipeline above handles it. To do it by hand (e.g. debugging a failed deploy):

```bash
cd /opt/helping-hands
git pull

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans

docker compose -f docker-compose.prod.yml exec -T api \
  ./apps/api/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma

docker image prune -f
```

`up -d` now blocks until `api` reports healthy before starting `web`/`admin` (see [production.md](production.md)), so there's no need for a manual wait between `up` and the migration step beyond what's already in the script.

---

## Rollback

Images are tagged with both `:latest` and `:<git-sha>`, so rolling back doesn't require a rebuild:

```bash
cd /opt/helping-hands
git log --oneline -5                 # find the last-good sha

# Point the compose file at a specific sha instead of :latest for this run
docker compose -f docker-compose.prod.yml pull  # (or manually: docker pull ${IMAGE_PREFIX}-api:<good-sha> etc., then re-tag :latest locally)
```

The simplest reliable rollback: re-run the GitHub Actions workflow against the last-good commit (`workflow_dispatch` on that ref, or revert-and-push), so `build-and-push` re-tags `:latest` from known-good source rather than hand-editing tags on the box.

**Database migrations do not auto-rollback.** If the bad deploy included a migration, rolling back the app images without rolling back the schema can break the older code against the newer schema — check `packages/database/prisma/migrations/` for anything new in the bad deploy before rolling back, and coordinate a manual down-migration if needed. Never run `prisma migrate reset` on production to "fix" this — it drops all data.

---

## Zero(er)-downtime updates

For a single-service fix, avoid restarting the whole stack:

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps api
docker compose -f docker-compose.prod.yml up -d --no-deps web
docker compose -f docker-compose.prod.yml up -d --no-deps admin
```

Since `web`/`admin` now depend on `api`'s health check, updating `api` alone can briefly report `web`/`admin` as fine (they don't re-check the dependency on their own restart) while `api` is mid-restart — a few seconds of upstream 502s from nginx is the realistic worst case with a single-VPS, no-load-balancer setup like this one.
