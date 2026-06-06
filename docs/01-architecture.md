# Architecture

## Monorepo Layout

```
HelpingHands/
├── apps/
│   ├── api/                      # NestJS REST API
│   │   ├── src/
│   │   │   ├── main.ts           # Bootstrap: Helmet, CORS, Swagger, static files
│   │   │   ├── app.module.ts     # Root module
│   │   │   ├── config/           # ENV → ConfigService mapping
│   │   │   ├── common/           # Guards, decorators, filters, interceptors
│   │   │   ├── prisma/           # PrismaService + PrismaModule
│   │   │   └── modules/          # Feature modules (12 total)
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   │
│   ├── web/                      # Next.js 14 public website
│   │   ├── src/
│   │   │   ├── app/[locale]/     # App Router with locale segment
│   │   │   ├── components/       # Reusable React components
│   │   │   ├── contexts/         # AuthContext
│   │   │   ├── lib/              # api.ts, auth.ts, utils.ts
│   │   │   └── middleware.ts     # next-intl locale routing
│   │   ├── messages/             # en.json, ar.json
│   │   └── Dockerfile
│   │
│   └── admin/                    # Next.js 14 admin dashboard
│       ├── src/
│       │   ├── app/              # Routes (no locale prefix)
│       │   │   ├── login/
│       │   │   └── (dashboard)/  # Protected route group
│       │   ├── components/
│       │   ├── contexts/         # Admin AuthContext
│       │   └── lib/              # api.ts
│       └── Dockerfile
│
├── packages/
│   └── database/
│       ├── prisma/
│       │   ├── schema.prisma     # Single source of truth for DB schema
│       │   └── seed.ts           # Test data seeder
│       └── package.json
│
├── docker-compose.yml
├── turbo.json                    # Turbo pipeline config
├── pnpm-workspace.yaml
└── .env.example
```

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser / Client                     │
│                                                             │
│   ┌──────────────────┐         ┌──────────────────────┐    │
│   │  Web (port 3000) │         │  Admin (port 3001)   │    │
│   │  Next.js 14      │         │  Next.js 14          │    │
│   │  Participants    │         │  Admin / Employee /  │    │
│   │  Public content  │         │  Financial Officer   │    │
│   └────────┬─────────┘         └──────────┬───────────┘    │
└────────────┼──────────────────────────────┼────────────────┘
             │  HTTP / REST (Axios)          │
             ▼                              ▼
┌────────────────────────────────────────────────────────────┐
│                    API — NestJS (port 4000)                 │
│                                                            │
│  JwtAuthGuard (global) + RolesGuard (global)               │
│                                                            │
│  ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────┐ │
│  │ Auth │ │ Projects │ │Donations │ │ Blocks │ │ Files │ │
│  └──────┘ └──────────┘ └──────────┘ └────────┘ └───────┘ │
│  ┌─────────────┐ ┌──────────────┐ ┌───────┐ ┌──────────┐ │
│  │ Participants│ │    Admins    │ │  QR   │ │Dashboard │ │
│  └─────────────┘ └──────────────┘ └───────┘ └──────────┘ │
│  ┌───────────┐ ┌──────────┐                               │
│  │ Languages │ │  Email   │                               │
│  └───────────┘ └──────────┘                               │
│                                                            │
│  PrismaService ──────────────────────────┐                │
└─────────────────────────────────────────┼────────────────┘
                                          │
             ┌────────────────────────────┼──────┐
             │                            │      │
             ▼                            ▼      ▼
     ┌──────────────┐            ┌──────────┐  ┌──────────┐
     │  PostgreSQL  │            │  Redis   │  │  /uploads│
     │  (port 5432) │            │  (6379)  │  │  (local) │
     └──────────────┘            └──────────┘  └──────────┘
```

---

## Tech Stack

### Backend — `apps/api`

| Concern | Library / Tool |
|---------|---------------|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | Prisma 5 |
| Auth | Passport + passport-jwt, @nestjs/jwt |
| Validation | class-validator + class-transformer |
| File upload | Multer + Sharp (image processing) |
| Email | Nodemailer (SMTP) |
| QR codes | `qrcode` library |
| Security | Helmet, @nestjs/throttler (rate limiting) |
| API docs | Swagger (@nestjs/swagger) |
| Config | @nestjs/config (dotenv-based) |
| Password hashing | bcryptjs |

### Frontend (public) — `apps/web`

| Concern | Library / Tool |
|---------|---------------|
| Framework | Next.js 14 App Router |
| Language | TypeScript 5 |
| i18n | next-intl (en, ar, fr) |
| HTTP client | Axios + @tanstack/react-query |
| Forms | react-hook-form + zod |
| UI components | Radix UI primitives |
| Styling | Tailwind CSS, tailwind-merge, CVA |
| Icons | lucide-react |
| Auth state | React Context + localStorage |

### Frontend (admin) — `apps/admin`

Same as web, plus:

| Concern | Library / Tool |
|---------|---------------|
| Tables | @tanstack/react-table |
| Charts | Recharts |

### Database — `packages/database`

| Concern | Technology |
|---------|-----------|
| Database | PostgreSQL 16 |
| ORM | Prisma 5 (schema + migrations) |
| Seeding | ts-node + Prisma seed script |

### Infrastructure

| Concern | Technology |
|---------|-----------|
| Containers | Docker + Docker Compose |
| Build | Turbo (task graph + caching) |
| Package manager | pnpm 9 (workspaces) |
| Node version | >= 20 |

---

## Authentication Architecture

```
Client                        API
  │                             │
  ├─ POST /auth/login ─────────▶│ Validate credentials
  │◀──── accessToken (15m) ─────│ + refreshToken (7d, stored in DB)
  │      refreshToken (7d)       │
  │                             │
  ├─ Request with Bearer ───────▶│ JwtAuthGuard validates token
  │                             │ RolesGuard checks role
  │                             │
  ├─ 401 (token expired) ───────│
  │                             │
  ├─ POST /auth/refresh ────────▶│ Validate refreshToken from DB
  │◀──── new accessToken ────────│ Issue new pair, rotate refresh
```

**Token storage:**
- Web app: `localStorage` keys `access_token` / `refresh_token`
- Admin app: `localStorage` keys `admin_access_token` / `admin_refresh_token`
- Axios interceptors automatically attach Bearer header and retry on 401.

---

## Authorization Model

| Decorator | Effect |
|-----------|--------|
| `@Public()` | Skip JwtAuthGuard entirely |
| `@Roles('administrator')` | Allow only administrators |
| `@Roles('employee')` | Allow only employees |
| `@Roles('financial_officer')` | Allow only financial officers |
| `@Roles('participant')` | Allow only participants |
| `@Roles('administrator', 'employee')` | Allow either role |
| *(no decorator)* | Any authenticated user |

Guards are registered globally via `APP_GUARD` providers in `app.module.ts`.

---

## Request / Response Pattern

Every API response is wrapped by the global `ResponseInterceptor`:

```json
// Success
{ "data": { ... } }

// Paginated list
{ "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 10 } }

// Error (HttpExceptionFilter)
{ "statusCode": 400, "message": "Validation failed", "errors": [ ... ] }
```

---

## Multi-language Content Pattern

Static UI strings → `next-intl` (`messages/en.json`, `messages/ar.json`)

Database content (projects, blogs, news, events) → `Block` + `BlockTranslation`:

```
Block (id, category, imageUrl, isActive, ...)
  └─ BlockTranslation (languageCode="en", name, slug, brief, description)
  └─ BlockTranslation (languageCode="ar", name, slug, brief, description)
  └─ BlockTranslation (languageCode="fr", name, slug, brief, description)
```

The API returns the translation matching the `Accept-Language` header or a `lang` query param.

---

## File Storage Pattern

Files are stored on disk at `/uploads` and served statically by the NestJS app.

The `File` model is polymorphic:

```
File (id, referenceId, referenceType, name, url, fileType, isCover, isActive)
```

`referenceType` can be `"block"` today and extended to other entities without schema changes.

---

## QR Code Flow

```
1. Participant creates donation  →  API generates qrToken (32-char random string)
2. API stores qrToken in ProjectDonation.qrToken (unique)
3. API generates QR image encoding URL: {WEB_URL}/donations/{qrToken}
4. Employee opens Admin → Donations → scans QR
5. Admin calls GET /donations/token/{token}  →  returns donation details
6. Employee confirms → PATCH /donations/{id}/status  (approved | rejected)
7. API recalculates Project.progression
```
