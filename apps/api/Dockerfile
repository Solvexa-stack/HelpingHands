FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9.4.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd packages/database && pnpm db:generate
RUN cd apps/api && pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
RUN mkdir -p uploads

EXPOSE 4000
CMD ["node", "apps/api/dist/main"]
