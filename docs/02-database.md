# Database

## Provider

PostgreSQL 16 managed via **Prisma 5** ORM.

Schema file: `packages/database/prisma/schema.prisma`
Migrations stored in: `packages/database/prisma/migrations/`

---

## Entity-Relationship Overview

```
Language ──────────────────────────────────────────────────────────┐
                                                                    │ languageCode FK
Block ──────── BlockTranslation ────────────────────────────────────┘
  │
  ├── File[] (polymorphic: referenceType = "block")
  └── Project (one-to-one)
        │
        ├── Admin (financialOfficer)
        └── ProjectDonation[]
              │
              ├── Participant
              └── Admin (approver)

User ─── Admin      (referenceType = "admin")
     └── Participant (referenceType = "participant")
           └── ProjectDonation[]

User ─── RefreshToken[]
```

---

## Models

### `Language`

Represents a supported UI/content language.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK, auto-increment |
| name | String | e.g. "English" |
| code | String | unique, e.g. "en" |
| flagCode | String | country flag emoji/code |
| direction | Direction | `ltr` or `rtl` |
| order | Int | display order |
| isActive | Boolean | default true |
| blockTranslations | BlockTranslation[] | back-relation |

---

### `Block`

A piece of platform content (project intro, blog post, news article, event, about page).

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK, auto-increment |
| category | BlockCategory | project / blog / news / event / about_us |
| imageUrl | String? | cover image |
| fileUrl | String? | attached file |
| classification | String? | free-text tag |
| orderId | Int? | manual sort order |
| startDate | DateTime? | |
| endDate | DateTime? | |
| isActive | Boolean | default true |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| translations | BlockTranslation[] | |
| files | File[] | |
| project | Project? | one-to-one (when category = project) |

---

### `BlockTranslation`

A language-specific version of a Block's text content.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| blockId | Int | FK → Block |
| languageCode | String | FK → Language.code |
| name | String | title |
| slug | String | unique URL slug |
| brief | String? | short summary |
| description | String? | full rich text |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

### `File`

Polymorphic file record (images, videos, PDFs).

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| referenceId | Int | ID of the owning entity |
| referenceType | String | e.g. "block" |
| name | String | original filename |
| url | String | public URL path |
| orderId | Int? | display order |
| isActive | Boolean | default true |
| isCover | Boolean | default false |
| fileType | FileType | image / video / pdf |
| description | String? | alt text / caption |

---

### `User`

Authentication record shared by admins and participants.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| referenceId | Int | FK → Admin.id or Participant.id |
| referenceType | ReferenceType | "admin" or "participant" |
| email | String | unique |
| emailVerifiedAt | DateTime? | |
| password | String | bcrypt hash |
| avatar | String? | URL |
| isActive | Boolean | default true |
| rememberToken | String? | |
| joiningDate | DateTime | default now |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| admin | Admin? | relation |
| participant | Participant? | relation |
| refreshTokens | RefreshToken[] | |

---

### `Admin`

A staff member (administrator, employee, or financial officer).

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| firstName | String | |
| lastName | String | |
| role | AdminRole | administrator / employee / financial_officer |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| user | User | one-to-one |
| assignedProjects | Project[] | projects where this admin is the financial officer |
| approvedDonations | ProjectDonation[] | donations approved/rejected by this admin |

---

### `Participant`

A donor who creates donation pledges.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| firstName | String | |
| lastName | String | |
| representation | Representation | personal / company / organization |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| user | User | one-to-one |
| donations | ProjectDonation[] | |

---

### `RefreshToken`

Stored refresh tokens for token rotation.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| userId | Int | FK → User |
| token | String | unique, hashed |
| expiresAt | DateTime | |
| createdAt | DateTime | |

---

### `Project`

A fundraising project linked 1-to-1 with a Block.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| blockId | Int | unique FK → Block |
| location | String | |
| dateOfCompletion | DateTime? | actual completion date |
| value | Decimal | funding goal |
| progression | Int | 0–100 (%) auto-calculated |
| isCompleted | Boolean | default false |
| category | ProjectCategory | agricultural / industrial / trading |
| expectedStartDate | DateTime? | |
| financialOfficerId | Int? | FK → Admin |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| donations | ProjectDonation[] | |

---

### `ProjectDonation`

A single donation pledge by a participant to a project.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| projectId | Int | FK → Project |
| participantId | Int | FK → Participant |
| amount | Decimal | pledged amount |
| status | DonationStatus | pending / approved / rejected / cancelled |
| qrToken | String | unique, 32-char random string |
| approvedBy | Int? | FK → Admin |
| approvedAt | DateTime? | |
| notes | String? | reviewer notes |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

### `PasswordResetToken`

Short-lived tokens for the forgot-password flow.

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| email | String | |
| token | String | unique |
| expiresAt | DateTime | |
| createdAt | DateTime | |

---

## Enums

| Enum | Values |
|------|--------|
| `Direction` | `ltr`, `rtl` |
| `BlockCategory` | `project`, `blog`, `news`, `event`, `about_us` |
| `FileType` | `image`, `video`, `pdf` |
| `AdminRole` | `administrator`, `employee`, `financial_officer` |
| `Representation` | `personal`, `company`, `organization` |
| `ProjectCategory` | `agricultural`, `industrial`, `trading` |
| `DonationStatus` | `pending`, `approved`, `rejected`, `cancelled` |
| `ReferenceType` | `admin`, `participant` |

---

## Database Commands

```bash
# Run from packages/database or use root aliases

# Apply pending migrations (dev)
pnpm --filter @helping-hands/database db:migrate:dev

# Apply migrations (production)
pnpm --filter @helping-hands/database db:migrate

# Seed test data
pnpm --filter @helping-hands/database db:seed

# Reset DB and re-run all migrations (dev only)
pnpm --filter @helping-hands/database db:reset

# Regenerate Prisma client after schema changes
pnpm --filter @helping-hands/database db:generate

# Open Prisma Studio (visual DB browser)
pnpm db:studio
```

---

## Schema Change Workflow

1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm --filter @helping-hands/database db:migrate:dev -- --name describe_change`
3. Prisma generates a SQL migration file under `prisma/migrations/`
4. Run `pnpm --filter @helping-hands/database db:generate` to update the client
5. Restart the API (`pnpm --filter @helping-hands/api dev`)
