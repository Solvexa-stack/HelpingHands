# API Reference

## Base URL

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:4000/api` |
| Swagger UI | `http://localhost:4000/api/docs` |

All responses are wrapped:

```json
// Success
{ "data": { ... } }

// List
{ "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 10 } }

// Error
{ "statusCode": 400, "message": "...", "errors": [ ... ] }
```

---

## Authentication

### Auth Module — `POST /auth/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Login with email + password. Returns `accessToken` + `refreshToken`. |
| POST | `/auth/register` | Public | Register a new participant account. |
| POST | `/auth/refresh` | Public | Exchange a valid refreshToken for a new pair. |
| POST | `/auth/logout` | Authenticated | Revoke refreshToken from DB. |
| POST | `/auth/forgot-password` | Public | Send password reset email. |
| POST | `/auth/reset-password` | Public | Reset password using token from email. |
| PATCH | `/auth/change-password` | Authenticated | Change password (requires current password). |
| GET | `/auth/me` | Authenticated | Return current user's profile. |

**Login response:**
```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "referenceType": "participant",
      "referenceId": 1
    }
  }
}
```

---

## Projects

### Projects Module — `/projects/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects` | Public | List projects with filters (category, location, search, page, limit). |
| GET | `/projects/:id` | Public | Get single project with translations and donation stats. |
| POST | `/projects` | Admin / Employee | Create a new project (+ Block + translations). |
| PUT | `/projects/:id` | Admin / Employee | Update project details and translations. |
| DELETE | `/projects/:id` | Admin | Delete project. |
| PATCH | `/projects/:id/assign-officer` | Admin | Assign a financial officer to a project. |

**Project object:**
```json
{
  "id": 1,
  "location": "Cairo",
  "value": "100000.00",
  "progression": 45,
  "isCompleted": false,
  "category": "agricultural",
  "expectedStartDate": "2024-06-01T00:00:00.000Z",
  "block": {
    "translations": [
      { "languageCode": "en", "name": "Green Farm", "slug": "green-farm", "brief": "..." }
    ],
    "imageUrl": "/uploads/projects/cover.jpg"
  },
  "financialOfficer": { "id": 2, "firstName": "Sara", "lastName": "Ahmed" }
}
```

---

## Donations

### Donations Module — `/donations/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/donations` | Authenticated | List donations (participants see own; admins see all; officers see assigned projects). |
| GET | `/donations/:id` | Authenticated | Get donation by ID. |
| GET | `/donations/token/:token` | Authenticated | Look up donation by QR token (used by scanner). |
| GET | `/donations/:token/qr` | Authenticated | Get QR code image as PNG (inline). |
| GET | `/donations/:token/qr/download` | Authenticated | Download QR code image. |
| POST | `/donations` | Participant | Create a donation pledge. |
| PATCH | `/donations/:id/status` | Admin / Employee / Officer | Approve or reject a donation. |
| PATCH | `/donations/:id/cancel` | Participant | Cancel own pending donation. |

**Create donation body:**
```json
{ "projectId": 1, "amount": 5000 }
```

**Update status body:**
```json
{ "status": "approved", "notes": "Cash received and counted." }
```

---

## Blocks (Content)

### Blocks Module — `/blocks/*`

Blocks represent all content types: projects, blogs, news, events, about us.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/blocks` | Public | List blocks filtered by `category`, `isActive`, pagination. |
| GET | `/blocks/:id` | Public | Get block by ID with all translations. |
| GET | `/blocks/slug/:slug` | Public | Get block by translation slug. |
| POST | `/blocks` | Admin / Employee | Create block with translations. |
| PUT | `/blocks/:id` | Admin / Employee | Update block and translations. |
| PATCH | `/blocks/:id/toggle` | Admin / Employee | Toggle `isActive` flag. |
| DELETE | `/blocks/:id` | Admin | Delete block and all translations. |

---

## Languages

### Languages Module — `/languages/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/languages` | Public | List all languages. |
| GET | `/languages/:code` | Public | Get language by code (e.g. "ar"). |
| POST | `/languages` | Admin | Create new language. |
| PUT | `/languages/:code` | Admin | Update language. |
| PATCH | `/languages/:code/toggle` | Admin | Toggle active flag. |
| DELETE | `/languages/:code` | Admin | Delete language. |

---

## Participants

### Participants Module — `/participants/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/participants` | Admin / Employee | List all participants with pagination. |
| GET | `/participants/:id` | Admin / Employee / Self | Get participant profile. |
| PUT | `/participants/:id` | Participant (self) | Update own profile (name, representation). |
| PATCH | `/participants/:id/toggle-active` | Admin | Activate / deactivate participant. |
| PATCH | `/participants/:id/avatar` | Participant (self) | Upload avatar image (multipart/form-data). |

---

## Admins

### Admins Module — `/admins/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admins` | Admin | List all admin users. |
| GET | `/admins/financial-officers` | Admin | List financial officers only. |
| GET | `/admins/:id` | Admin | Get admin by ID. |
| POST | `/admins` | Admin | Create new admin / employee / officer. |
| PUT | `/admins/:id` | Admin | Update admin details. |
| PATCH | `/admins/:id/toggle-active` | Admin | Activate / deactivate admin account. |

---

## Files

### Files Module — `/files/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/files/upload` | Admin / Employee | Upload files (multipart/form-data). Body: `referenceId`, `referenceType`, `fileType`, files[]. |
| GET | `/files` | Authenticated | List files by `referenceId` + `referenceType`. |
| PATCH | `/files/:id/cover` | Admin / Employee | Set a file as the cover (unsets previous cover). |
| DELETE | `/files/:id` | Admin / Employee | Delete a file from disk and DB. |

---

## Dashboard

### Dashboard Module — `/dashboard/*`

All endpoints are authenticated. Returned data is filtered by role:
- **Administrator**: all data
- **Financial Officer**: only their assigned projects
- **Employee**: all data (read-only subset)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | Totals: projects, donations, participants, pending donations. |
| GET | `/dashboard/recent-donations` | Latest 5 donations. |
| GET | `/dashboard/recent-projects` | Latest 5 projects. |
| GET | `/dashboard/donations-by-month` | Monthly donation amounts for the current year (for charts). |

---

## Global Guards

```typescript
// app.module.ts — applied to every route
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
]
```

**JwtAuthGuard**: validates Bearer token; skips routes decorated with `@Public()`.

**RolesGuard**: reads roles from `@Roles(...)` metadata; if no `@Roles()` decorator is present, any authenticated user is allowed.

---

## Common Decorators

```typescript
@Public()                    // No auth required
@Roles('administrator')      // Only administrators
@Roles('employee', 'administrator') // Either role
@CurrentUser()               // Inject full JWT payload
@CurrentUser('sub')          // Inject only the user ID
```

---

## JWT Payload Shape

```typescript
interface JwtPayload {
  sub: number;           // User.id
  email: string;
  role: string;          // AdminRole or "participant"
  referenceType: string; // "admin" or "participant"
  referenceId: number;   // Admin.id or Participant.id
}
```

---

## File Upload

Files are stored on disk at `UPLOAD_DIR` (default `./uploads`) and served statically at `/uploads/*`.

- Max size: `MAX_FILE_SIZE` (default 10 MB)
- Supported types: image (jpeg, png, webp), video (mp4), pdf

---

## Rate Limiting

`@nestjs/throttler` is configured globally. Default limits apply to all routes unless overridden at the controller level.

---

## Environment Variables (API)

```env
NODE_ENV=development
APP_PORT=4000
APP_URL=http://localhost:4000
WEB_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001

DATABASE_URL="postgresql://postgres:password@localhost:5432/helping_hands?schema=public"

JWT_SECRET=change-me
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change-me-too
JWT_REFRESH_EXPIRES_IN=7d

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@helpinghands.org
SMTP_PASS=your-smtp-password
MAIL_FROM="HelpingHands <noreply@helpinghands.org>"
```
