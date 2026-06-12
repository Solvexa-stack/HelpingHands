# HelpingHands — Complete Build Roadmap for Claude Code

## How to use this roadmap

Each file in this folder is a **self-contained prompt** for Claude Code.
Feed them **in order**, one at a time. Each step references the previous ones.
Do NOT skip steps — each one builds on the last.

---

## Step Sequence

| # | File | What gets built |
|---|------|----------------|
| 01 | `01-db-study-schema.md` | Prisma schema: ProjectStudy, StudySection, StudyVote, StudyDepartmentTemplate |
| 02 | `02-api-study-module.md` | NestJS module: study CRUD, section management, status transitions |
| 03 | `03-api-voting-module.md` | NestJS module: vote creation, results, period management |
| 04 | `04-api-payment-module.md` | Stripe + PayPal integration, webhook handlers, online donations |
| 05 | `05-api-notifications.md` | Email + in-app notifications for study updates, vote open, approval |
| 06 | `06-admin-study-ui.md` | Admin dashboard: study creation, section filling, department templates |
| 07 | `07-admin-voting-ui.md` | Admin dashboard: voting management, results display, final decision |
| 08 | `08-web-study-public.md` | Public website: study page, vote participation, donation with Visa |
| 09 | `09-ci-cd-pipeline.md` | GitHub Actions: lint → test → build → deploy (staging + production) |
| 10 | `10-deploy-production.md` | VPS setup, Docker Compose prod config, Nginx, SSL, monitoring |

---

## Architecture principles (never break these)

- **API first**: every feature is an API endpoint before any UI is built
- **Role guards everywhere**: no endpoint without `@Roles()` or `@Public()`
- **Prisma transactions**: multi-table writes always use `prisma.$transaction([])`
- **Response wrapper**: all responses use the existing `ResponseInterceptor`
- **DTOs with validation**: every input has a DTO with `class-validator` decorators
- **Typed everything**: no `any` in TypeScript
- **Idempotent migrations**: never edit existing migrations, always create new ones
- **Environment variables**: no hardcoded secrets, all via `ConfigService`

---

## Integration map

```
HelpingHands API
    ├── Stripe         → online donations (credit/debit card)
    ├── PayPal         → alternative online giving
    ├── Nodemailer     → email notifications (already wired)
    ├── Redis          → job queues for emails + webhook retries
    └── Cloudinary     → (optional) cloud image storage instead of local disk
```

---

## Folder structure additions (new files only)

```
apps/api/src/modules/
    ├── study/              ← NEW: project study management
    ├── voting/             ← NEW: voting system
    └── payments/           ← NEW: Stripe + PayPal

packages/database/prisma/
    └── schema.prisma       ← MODIFIED: add study models
```
