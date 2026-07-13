FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9.4.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

# ── Development ───────────────────────────────────────────────────────────
# Used by docker-compose.yml (build target: dev). Source is bind-mounted at
# runtime over /app; node_modules here come from the `deps` layer via
# anonymous volumes in docker-compose.yml, so the bind mount can't shadow
# installed packages or a stale Prisma client. Regenerates the Prisma client
# from the (possibly just-edited) mounted schema on every start, then runs
# Nest in watch mode. Runs as root, matching the host user's bind-mounted
# files — fine for a local, non-shipped image.
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @helping-hands/database db:generate && pnpm --filter @helping-hands/api dev"]

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY . .
RUN cd packages/database && pnpm db:generate
RUN cd apps/api && pnpm build

FROM base AS runner
ENV NODE_ENV=production
# su-exec drops from root to the app user in docker-entrypoint.sh, after the
# entrypoint has fixed ownership of the mounted `uploads` volume.
RUN apk add --no-cache su-exec
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
# packages/database's own package.json + node_modules + tsconfig — not just
# its prisma/ folder — so `pnpm --filter @helping-hands/database db:seed*`
# (ts-node against the raw .ts seeds, e.g. for the demo-data seed) resolves
# its devDependencies (ts-node, bcryptjs, @prisma/client) and compiler
# options correctly when run inside this image; prisma/ alone is only
# enough for `prisma migrate deploy`.
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/packages/database/tsconfig.json ./packages/database/tsconfig.json
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
RUN mkdir -p uploads && chown -R nestjs:nodejs uploads
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main"]
