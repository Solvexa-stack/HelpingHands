# HelpingHands — Project Extension Prompt

## Context

An existing system is already implemented and running.
You MUST extend it. Do NOT regenerate, redesign, or rewrite any existing code.

---

## Existing Stack (DO NOT CHANGE)

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | NestJS (apps/api, port 4000) |
| Public Frontend | Next.js 14 App Router (apps/web, port 3000) |
| Admin Dashboard | Next.js 14 App Router (apps/admin, port 3001) |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT Access Token + Refresh Token (global `JwtAuthGuard` + `RolesGuard`) |
| RBAC | `@Roles(AdminRole.administrator | employee | financial_officer)` |
| i18n | `next-intl` with `[locale]` segment; messages JSON files |
| Files | Polymorphic `files` table (referenceId + referenceType) |
| Payments | Stripe + PayPal (`online_donations` table) |
| QR | 32-char random tokens on `project_donations` |
| Email | Already wired — extend only, do not touch |

---

## Existing Architecture (CRITICAL — READ BEFORE TOUCHING ANYTHING)

### Block-Based CMS

All content (title, description, images, documents, SEO, multilingual fields)
lives in two tables:

```
blocks            → root entity (id, category, imageUrl, fileUrl, isActive, …)
block_translations → per-language name, slug, brief, description
```

`Block.category = 'project'` is extended by the `projects` table:

```
projects.blockId → blocks.id   (unique, cascade delete)
```

### HARD RULE — Foreign Keys for New Project Tables

New tables that relate to a project MUST use:

```prisma
projectId  Int  @map("project_id")
block      Block  @relation(fields: [projectId], references: [id])
```

Pointing `projectId → blocks.id` (NOT `projects.id`).  
The existing `project_donations` table already uses `projectId → projects.id` — do NOT change it.  
All NEW tables follow the `→ blocks.id` pattern.

### Existing Modules (already implemented — extend only)

- `auth` — JWT login, refresh, password reset
- `admins` — CRUD admins (administrator / employee / financial_officer)
- `blocks` — CMS block management + translations
- `projects` — project CRUD, progression auto-recalculate
- `donations` — physical cash donations, QR scan approval
- `payments` — Stripe / PayPal online donations
- `study` — project study lifecycle (draft → voting → approved)
- `voting` — participant votes on study
- `qr` — QR token generation service
- `files` — polymorphic file upload service
- `languages` — language management
- `dashboard` — admin stats
- `notifications` — per-user notification model

---

## What You MUST Add

### 1 — Prisma Schema Extensions (packages/database/prisma/schema.prisma)

Add the following models. Use `@@map` for snake_case table names.

#### New Enums

```prisma
enum StepStatus {
  pending
  assigned
  in_progress
  completed
  verified
  cancelled
}

enum PhaseStatus {
  pending
  in_progress
  completed
  cancelled
}

enum TaskStatus {
  pending
  assigned
  in_progress
  completed
  cancelled
}

enum MilestoneStatus {
  pending
  in_progress
  completed
  missed
}

enum ExpenseStatus {
  pending
  approved
  rejected
}

enum TransactionType {
  income
  expense
  refund
  adjustment
}
```

#### New Models

```prisma
// project_steps — supports parent/child nesting
model ProjectStep {
  id          Int        @id @default(autoincrement())
  projectId   Int        @map("project_id")        // → blocks.id
  blockId     Int        @map("block_id")           // → blocks.id (content)
  parentId    Int?       @map("parent_id")
  status      StepStatus @default(pending)
  priority    Int        @default(0)
  startDate   DateTime?  @map("start_date")
  endDate     DateTime?  @map("end_date")
  progress    Decimal    @default(0) @db.Decimal(5, 2)
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  project  Block          @relation("StepProject", fields: [projectId], references: [id])
  block    Block          @relation("StepBlock",   fields: [blockId],   references: [id])
  parent   ProjectStep?   @relation("StepChildren", fields: [parentId], references: [id])
  children ProjectStep[]  @relation("StepChildren")

  @@index([projectId])
  @@map("project_steps")
}

model ProjectPhase {
  id        Int         @id @default(autoincrement())
  projectId Int         @map("project_id")   // → blocks.id
  blockId   Int         @map("block_id")     // → blocks.id (content)
  order     Int         @default(0)
  status    PhaseStatus @default(pending)
  startDate DateTime?   @map("start_date")
  endDate   DateTime?   @map("end_date")
  progress  Decimal     @default(0) @db.Decimal(5, 2)
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")

  project Block          @relation("PhaseProject", fields: [projectId], references: [id])
  block   Block          @relation("PhaseBlock",   fields: [blockId],   references: [id])
  tasks   ProjectTask[]

  @@index([projectId])
  @@map("project_phases")
}

model ProjectTask {
  id           Int        @id @default(autoincrement())
  projectId    Int        @map("project_id")    // → blocks.id
  phaseId      Int?       @map("phase_id")
  blockId      Int        @map("block_id")      // → blocks.id (content)
  assignedToId Int?       @map("assigned_to_id")
  status       TaskStatus @default(pending)
  progress     Decimal    @default(0) @db.Decimal(5, 2)
  startDate    DateTime?  @map("start_date")
  endDate      DateTime?  @map("end_date")
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  project    Block         @relation("TaskProject", fields: [projectId],    references: [id])
  block      Block         @relation("TaskBlock",   fields: [blockId],      references: [id])
  phase      ProjectPhase? @relation(fields: [phaseId],      references: [id])
  assignedTo Admin?        @relation("TaskAssignee", fields: [assignedToId], references: [id])

  @@index([projectId])
  @@index([phaseId])
  @@map("project_tasks")
}

model ProjectBudget {
  id              Int      @id @default(autoincrement())
  projectId       Int      @map("project_id")   // → blocks.id
  blockId         Int      @map("block_id")     // → blocks.id (content)
  estimatedAmount Decimal  @map("estimated_amount") @db.Decimal(15, 2)
  approvedAmount  Decimal? @map("approved_amount")  @db.Decimal(15, 2)
  actualAmount    Decimal  @default(0) @map("actual_amount") @db.Decimal(15, 2)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  project  Block             @relation("BudgetProject", fields: [projectId], references: [id])
  block    Block             @relation("BudgetBlock",   fields: [blockId],   references: [id])
  expenses ProjectExpense[]

  @@index([projectId])
  @@map("project_budgets")
}

model ProjectExpense {
  id          Int           @id @default(autoincrement())
  projectId   Int           @map("project_id")   // → blocks.id
  blockId     Int           @map("block_id")     // → blocks.id (content)
  budgetId    Int?          @map("budget_id")
  amount      Decimal       @db.Decimal(15, 2)
  invoiceRef  String?       @map("invoice_ref") @db.VarChar(255)
  status      ExpenseStatus @default(pending)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  project Block          @relation("ExpenseProject", fields: [projectId], references: [id])
  block   Block          @relation("ExpenseBlock",   fields: [blockId],   references: [id])
  budget  ProjectBudget? @relation(fields: [budgetId], references: [id])

  @@index([projectId])
  @@index([budgetId])
  @@map("project_expenses")
}

model ProjectTransaction {
  id            Int             @id @default(autoincrement())
  projectId     Int             @map("project_id")    // → blocks.id
  type          TransactionType
  amount        Decimal         @db.Decimal(15, 2)
  referenceType String?         @map("reference_type") @db.VarChar(50)
  referenceId   Int?            @map("reference_id")
  notes         String?         @db.Text
  createdAt     DateTime        @default(now()) @map("created_at")

  project Block @relation("TransactionProject", fields: [projectId], references: [id])

  @@index([projectId])
  @@index([referenceType, referenceId])
  @@map("project_transactions")
}

model ProjectMilestone {
  id             Int             @id @default(autoincrement())
  projectId      Int             @map("project_id")   // → blocks.id
  blockId        Int             @map("block_id")     // → blocks.id (content)
  targetDate     DateTime?       @map("target_date")
  completedAt    DateTime?       @map("completed_at")
  status         MilestoneStatus @default(pending)
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  project Block @relation("MilestoneProject", fields: [projectId], references: [id])
  block   Block @relation("MilestoneBlock",   fields: [blockId],   references: [id])

  @@index([projectId])
  @@map("project_milestones")
}
```

Also add back-relations to `Block`:

```prisma
// Inside existing model Block { … } — ADD these lines:
  steps        ProjectStep[]       @relation("StepProject")
  stepBlocks   ProjectStep[]       @relation("StepBlock")
  phases       ProjectPhase[]      @relation("PhaseProject")
  phaseBlocks  ProjectPhase[]      @relation("PhaseBlock")
  tasks        ProjectTask[]       @relation("TaskProject")
  taskBlocks   ProjectTask[]       @relation("TaskBlock")
  budgets      ProjectBudget[]     @relation("BudgetProject")
  budgetBlocks ProjectBudget[]     @relation("BudgetBlock")
  expenses     ProjectExpense[]    @relation("ExpenseProject")
  expenseBlocks ProjectExpense[]   @relation("ExpenseBlock")
  transactions ProjectTransaction[] @relation("TransactionProject")
  milestones   ProjectMilestone[]  @relation("MilestoneProject")
  milestoneBlocks ProjectMilestone[] @relation("MilestoneBlock")
```

Add task assignee back-relation to `Admin`:

```prisma
// Inside existing model Admin { … } — ADD:
  assignedTasks ProjectTask[] @relation("TaskAssignee")
```

Run migration after schema changes:

```bash
pnpm --filter @helping-hands/database db:migrate:dev
```

---

### 2 — NestJS API Modules (apps/api/src/modules/)

Create one NestJS module per feature following the existing pattern:
`<name>.module.ts` / `<name>.controller.ts` / `<name>.service.ts` / `dto/<name>.dto.ts`

Register each new module in `app.module.ts`.

#### 2a — Execution Module (`modules/execution/`)

Handles steps, phases, and tasks for a project.

**Controller routes** (prefix `/projects/:projectId/execution`):

```
GET    /steps                   → list steps (with children)
POST   /steps                   → create step (body: blockId, parentId?, status, priority, dates)
PATCH  /steps/:id               → update step
DELETE /steps/:id               → delete step
PATCH  /steps/:id/progress      → update step progress (body: { progress })

GET    /phases                  → list phases ordered by `order`
POST   /phases                  → create phase (body: blockId, order, status, dates)
PATCH  /phases/:id              → update phase
DELETE /phases/:id              → delete phase

GET    /tasks                   → list tasks (filter by phaseId)
POST   /tasks                   → create task (body: blockId, phaseId?, assignedToId?, status)
PATCH  /tasks/:id               → update task
DELETE /tasks/:id               → delete task
```

**RBAC**: `administrator` and `employee` roles only.

**Auto-recalculate project `progression`** when any step or task progress changes
(same pattern as existing `ProjectsService.recalculateProgression`).

#### 2b — Financial Module (`modules/financial/`)

Handles budgets, expenses, and transaction ledger.

**Controller routes** (prefix `/projects/:projectId/financial`):

```
GET    /budgets                 → list budgets
POST   /budgets                 → create budget (body: blockId, estimatedAmount)
PATCH  /budgets/:id             → update budget (approvedAmount, actualAmount)
DELETE /budgets/:id             → delete budget

GET    /expenses                → list expenses (filter by budgetId, status)
POST   /expenses                → create expense (body: blockId, budgetId?, amount, invoiceRef)
PATCH  /expenses/:id/status     → approve or reject expense (body: { status })
  → on approve: create ProjectTransaction { type: 'expense', referenceType: 'expense', referenceId }
  → on approve: increment budget.actualAmount

GET    /transactions            → list all transactions for project
POST   /transactions            → manual adjustment (body: { type, amount, notes })
```

**Donation → Transaction hook** (add to existing `DonationsService.approveDonation`):
When a `ProjectDonation` is approved, create:

```ts
prisma.projectTransaction.create({
  data: {
    projectId: donation.project.blockId,   // blocks.id of the project
    type: 'income',
    amount: donation.amount,
    referenceType: 'donation',
    referenceId: donation.id,
  },
})
```

**RBAC**: `administrator` and `financial_officer` for budgets/transactions; `employee` can create expenses.

#### 2c — Milestones Module (`modules/milestones/`)

```
GET    /projects/:projectId/milestones         → list milestones
POST   /projects/:projectId/milestones         → create milestone (body: blockId, targetDate)
PATCH  /projects/:projectId/milestones/:id     → update milestone (status, completedAt)
DELETE /projects/:projectId/milestones/:id     → delete milestone
```

**RBAC**: `administrator` and `employee`.

#### 2d — Reports Module (`modules/reports/`)

```
GET /reports/projects/:projectId/pdf/summary     → PDF project summary
GET /reports/projects/:projectId/pdf/financial   → PDF financial report
GET /reports/projects/:projectId/pdf/progress    → PDF progress report
GET /reports/projects/:projectId/excel/financial → Excel financial report
GET /reports/projects/:projectId/excel/donations → Excel donations report
GET /reports/projects/:projectId/excel/expenses  → Excel expenses report
```

Use `pdfkit` for PDF and `exceljs` for Excel (install via `pnpm --filter @helping-hands/api add pdfkit exceljs`).

**RBAC**: `administrator` and `financial_officer`.

#### DTOs

All DTOs must use `class-validator` decorators (`@IsInt`, `@IsEnum`, `@IsOptional`, etc.)
matching the existing DTO pattern in `modules/projects/dto/project.dto.ts`.

---

### 3 — File Attachments

Use the **existing polymorphic `files` table**. No new file tables.

Allowed `referenceType` values for new entities:

| Entity | referenceType |
|---|---|
| ProjectStep | `Step` |
| ProjectPhase | `Phase` |
| ProjectTask | `Task` |
| ProjectBudget | `Budget` |
| ProjectExpense | `Expense` |
| ProjectMilestone | `Milestone` |

The existing `FilesService` handles upload — call it from the new controllers
passing the correct `referenceType` and `referenceId`.

---

### 4 — Admin Dashboard Pages (apps/admin)

Follow the existing patterns:
- Pages live in `src/app/(dashboard)/`
- Use `AuthContext` + `useTranslations` from `next-intl`
- API calls go through `src/lib/api.ts`
- Sidebar entries added to `src/components/layout/sidebar.tsx` with role guards

#### New pages

```
(dashboard)/projects/[id]/execution/page.tsx      → Steps + Phases + Tasks tabs
(dashboard)/projects/[id]/financial/page.tsx       → Budgets + Expenses + Ledger tabs
(dashboard)/projects/[id]/milestones/page.tsx      → Milestones list + timeline
(dashboard)/reports/page.tsx                       → Report generation (download PDF/Excel)
```

Each page must:
1. Fetch data server-side where possible (RSC)
2. Use existing UI components (`confirm-dialog`, `image-upload`, `rich-text-editor`)
3. Respect `AdminRole` visibility (sidebar hides financial pages from `employee`)

Add i18n keys to `src/messages/en.json`, `ar.json`, `fr.json` for every new UI label.

---

### 5 — Public Web Pages (apps/web)

Add to `src/app/[locale]/projects/[id]/`:

```
execution/page.tsx   → public read-only view of project steps/phases (SSR)
milestones/page.tsx  → public timeline of project milestones (SSR)
```

Follow existing SSR pattern from `apps/web/src/app/[locale]/projects/[id]/page.tsx`.

---

## Transaction Rules (Financial Integrity)

| Event | Action |
|---|---|
| `ProjectDonation` approved | Create `ProjectTransaction { type: income }` |
| `ProjectExpense` approved | Create `ProjectTransaction { type: expense }`, increment `budget.actualAmount` |
| `ProjectExpense` rejected | No transaction |
| Manual entry | Create `ProjectTransaction { type: adjustment }` |
| Refund processed | Create `ProjectTransaction { type: refund }` |

---

## Hard Constraints

1. **DO NOT** modify or delete any existing Prisma models or fields.
2. **DO NOT** touch `auth` module, JWT strategy, or guard configuration.
3. **DO NOT** add content fields (name, description, images) to new business tables — use `blocks` + `block_translations`.
4. **ALL** new project relations use `projectId → blocks.id`.
5. Keep every NestJS module self-contained with its own `Module`, `Controller`, `Service`, and DTOs.
6. Register all new modules in `apps/api/src/app.module.ts`.
7. Run `pnpm --filter @helping-hands/database db:migrate:dev` after schema changes.
8. Keep admin pages behind the existing `(dashboard)` layout auth guard — no new auth logic.
9. Use `pnpm --filter @helping-hands/<app> add <package>` to add dependencies.
10. Never commit `.env` files.
