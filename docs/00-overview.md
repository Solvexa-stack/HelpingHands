# HelpingHands — Project Overview

## What Is HelpingHands?

HelpingHands is a full-stack **donation management platform**. Participants browse fundraising projects, pledge donations, and physically deliver money to an employee. The employee scans the participant's QR code to verify and approve the donation, automatically updating the project's funding progress.

---

## Core Workflow

```
Participant                 Employee / Officer              System
    │                              │                           │
    ├─ Browse projects             │                           │
    ├─ Create donation pledge ─────┼───────────────────────────▶ Generate QR token
    ├─ Receive QR code             │                           │
    ├─ Deliver cash physically     │                           │
    │                              ├─ Scan QR code             │
    │                              ├─ Verify amount            │
    │                              ├─ Approve / Reject ────────▶ Update project progress
    │◀─────────────────────────────┴───────────────────────────  Notify participant
```

---

## Roles

| Role | Description |
|------|-------------|
| **Participant** | Donor who creates donation pledges and delivers cash |
| **Employee** | Scans QR codes, manages projects and content |
| **Financial Officer** | Approves donations for projects they are assigned to |
| **Administrator** | Full system access: manage users, languages, all content |

---

## Test Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

---

## Applications

| App | URL | Purpose |
|-----|-----|---------|
| **API** | http://localhost:4000 | NestJS REST backend |
| **Web** | http://localhost:3000 | Public site for participants |
| **Admin** | http://localhost:3001 | Dashboard for staff |
| **Swagger** | http://localhost:4000/api/docs | API documentation |

---

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10 + TypeScript |
| Frontend (public) | Next.js 14 App Router |
| Frontend (admin) | Next.js 14 App Router |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / Queue | Redis 7 |
| Auth | JWT (access 15m + refresh 7d) |
| File storage | Local disk (`/uploads`) |
| i18n | next-intl (en, ar, fr) |
| Styling | Tailwind CSS + Radix UI |
| Build system | Turbo + pnpm workspaces |
| Container | Docker + Docker Compose |

---

## Repository Structure

```
HelpingHands/
├── apps/
│   ├── api/          ← NestJS REST API          (port 4000)
│   ├── web/          ← Next.js public website   (port 3000)
│   └── admin/        ← Next.js admin dashboard  (port 3001)
├── packages/
│   └── database/     ← Prisma schema + seed
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Key Design Decisions

- **Monorepo** managed by pnpm workspaces and Turbo for unified builds and caching.
- **Polymorphic users**: a single `User` table links to either `Admin` or `Participant` via `referenceId` + `referenceType`, avoiding separate auth tables.
- **QR-based verification**: each donation pledge generates a unique 32-character token embedded in a scannable QR code — no cash is handled digitally.
- **Auto-progress calculation**: `Project.progression` recalculates automatically every time a donation is approved or rejected.
- **Global guards**: `JwtAuthGuard` and `RolesGuard` are applied globally; routes opt out with `@Public()` or restrict access with `@Roles(...)`.
- **Multi-language content**: `Block` + `BlockTranslation` pattern lets admins write content in Arabic, English, and French without duplicating records.
