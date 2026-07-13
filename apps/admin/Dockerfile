FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

# ── Development ───────────────────────────────────────────────────────────
# Used by docker-compose.yml (build target: dev). Source is bind-mounted at
# runtime; node_modules here come from the `deps` layer via anonymous
# volumes in docker-compose.yml. `next dev` reads NEXT_PUBLIC_* from the
# running process env, so no build-time ARGs are needed here (unlike
# `builder` below, which inlines them into the static production bundle).
FROM deps AS dev
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001
CMD ["pnpm", "--filter", "@helping-hands/admin", "dev"]

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time,
# so they must be passed as build args, not just runtime env vars.
ARG NEXT_PUBLIC_ADMIN_API_URL
ARG NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL

RUN cd apps/admin && pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ || exit 1
CMD ["node", "apps/admin/server.js"]
