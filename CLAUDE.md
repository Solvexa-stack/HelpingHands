# HelpingHands — Donation Management Platform

## Project Overview
Full-stack monorepo donation management platform. Participants create donation requests, physical money is delivered to employees, who verify via QR code scan and approve.

## Monorepo Structure
```
HelpingHands/
├── apps/
│   ├── api/          # NestJS REST API (port 4000)
│   ├── web/          # Next.js public website (port 3000)
│   └── admin/        # Next.js admin dashboard (port 3001)
└── packages/
    └── database/     # Prisma schema + seed
```

## Commands
```bash
# Install all dependencies
pnpm install

# Start all apps in dev
pnpm dev

# Individual apps
pnpm --filter @helping-hands/api dev
pnpm --filter @helping-hands/web dev
pnpm --filter @helping-hands/admin dev

# Database
pnpm --filter @helping-hands/database db:migrate:dev
pnpm --filter @helping-hands/database db:seed

# Build
pnpm build
```

## Key Architecture Decisions

### Backend (apps/api)
- NestJS with global `JwtAuthGuard` + `RolesGuard` applied via `APP_GUARD`
- `@Public()` decorator opts routes out of auth
- `@Roles(...)` restricts to specific roles
- Polymorphic users: `User` links to either `Admin` or `Participant` via `referenceType`
- Project progress auto-recalculates after donation approval/rejection
- QR tokens are 32-char random strings embedded in URLs

### Database (packages/database)
- PostgreSQL + Prisma ORM
- Schema at `packages/database/prisma/schema.prisma`
- Run migrations from package root: `cd packages/database && pnpm db:migrate:dev`

### Frontend (apps/web)
- Next.js 14 App Router with `[locale]` segment for i18n
- `next-intl` for translations; messages in `apps/web/messages/`
- `AuthContext` for client-side auth state; uses `localStorage` for tokens
- Server components fetch data directly, client components use React Query

### Admin (apps/admin)
- Next.js 14 App Router, `(dashboard)` route group has auth guard
- Only `admin` referenceType users can log in
- Role-based sidebar visibility

## Environment Setup
Copy `.env.example` to `.env` and configure. Start Postgres:
```bash
docker compose up postgres -d
```

## Test Accounts (after seeding)
| Role               | Email                          | Password       |
|--------------------|--------------------------------|----------------|
| Administrator      | admin@helpinghands.org         | Admin@123456   |
| Employee           | employee@helpinghands.org      | Employee@123   |
| Financial Officer  | officer@helpinghands.org       | Officer@123    |
| Participant        | participant@example.com        | Participant@123|
