# HelpingHands — Donation Management Platform

> A full-stack platform for managing donation-based projects where online payment gateways are unavailable. Participants create donation requests, physical money is delivered to employees who verify via QR code.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend API | NestJS + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Public Website | Next.js 14 (App Router, SSR) |
| Admin Dashboard | Next.js 14 |
| Auth | JWT + Refresh Tokens |
| Email | Nodemailer (SMTP) |
| QR Codes | `qrcode` package |
| i18n | next-intl (EN, AR, FR) |
| Package Manager | pnpm workspaces + Turborepo |

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 14+ (or Docker)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/helping-hands.git
cd HelpingHands
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials and SMTP settings
```

### 3. Start Database
```bash
# Using Docker (recommended)
docker compose up postgres -d

# Or configure your own PostgreSQL instance
```

### 4. Run Migrations & Seed
```bash
cd packages/database
pnpm db:migrate:dev
pnpm db:seed
cd ../..
```

### 5. Start Development Servers
```bash
pnpm dev
# API:   http://localhost:4000
# Web:   http://localhost:3000
# Admin: http://localhost:3001
# Docs:  http://localhost:4000/api/docs
```

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@helpinghands.org | Admin@123456 |
| Employee | employee@helpinghands.org | Employee@123 |
| Financial Officer | officer@helpinghands.org | Officer@123 |
| Participant | participant@example.com | Participant@123 |

## Donation Workflow

```
Participant → Creates donation request → System generates QR code
     ↓
Participant sends QR to relative
     ↓
Relative visits employee office with QR
     ↓
Employee scans QR → Views donation details → Approves/Rejects
     ↓
System updates project progress + sends email notification
```

## API Documentation

Swagger UI available at: `http://localhost:4000/api/docs`

### Key Endpoints
```
POST   /api/v1/auth/login          # Login
POST   /api/v1/auth/register       # Register (participants)
POST   /api/v1/auth/refresh        # Refresh tokens

GET    /api/v1/projects            # List projects (public)
GET    /api/v1/projects/:id        # Project details (public)
POST   /api/v1/projects            # Create project (employee+)

POST   /api/v1/donations           # Create donation (participant)
GET    /api/v1/donations/token/:t  # Verify by QR token (public)
PATCH  /api/v1/donations/:id/status # Approve/Reject (employee+)

GET    /api/v1/dashboard/stats     # Dashboard stats
```

## User Roles & Permissions

| Action | Admin | Employee | Financial Officer | Participant |
|--------|-------|----------|-------------------|-------------|
| Manage projects | ✅ | ✅ | View only | ❌ |
| Manage content | ✅ | ✅ | ❌ | ❌ |
| Verify donations | ✅ | ✅ | Assigned projects | ❌ |
| Create donations | ❌ | ❌ | ❌ | ✅ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | Limited | ❌ |

## Production Deployment

```bash
# Build all apps
pnpm build

# Or use Docker Compose
docker compose up -d
```

### Environment Variables (Production)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
SMTP_HOST=your-smtp-host
SMTP_USER=your-email
SMTP_PASS=your-password
APP_URL=https://api.yourdomain.com
WEB_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
```

## Project Structure

```
apps/api/src/
├── modules/
│   ├── auth/          # JWT auth, refresh tokens, password reset
│   ├── admins/        # Admin/employee/officer management
│   ├── participants/  # Participant management
│   ├── projects/      # Project CRUD + progress calculation
│   ├── donations/     # Donation workflow + status updates
│   ├── blocks/        # Content management (blog/news/events/about)
│   ├── files/         # File upload management
│   ├── languages/     # Multi-language support
│   ├── email/         # Email notifications
│   ├── qr/            # QR code generation
│   └── dashboard/     # Analytics & statistics
└── common/
    ├── guards/        # JwtAuthGuard, RolesGuard
    ├── decorators/    # @CurrentUser, @Roles, @Public
    └── filters/       # Global exception filter
```

## License

MIT
