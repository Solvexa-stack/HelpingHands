# Step 01 — Database Schema: Project Study System

## Context

You are working on the HelpingHands monorepo.
Schema file: `packages/database/prisma/schema.prisma`
After every schema change you MUST run:
```bash
pnpm --filter @helping-hands/database db:migrate:dev -- --name <migration_name>
pnpm --filter @helping-hands/database db:generate
```

## What to build

Add the complete study system to the Prisma schema. This system sits between project creation and donation opening. A project cannot accept donations until its study is approved.

---

## New enums to add

```prisma
enum StudyStatus {
  draft           // study is being filled in by admin/employee
  in_review       // submitted for internal review
  published       // visible to public, voting can open
  voting_open     // participants can cast votes
  voting_closed   // voting period ended, awaiting final decision
  approved        // study approved, donations can open
  rejected        // study rejected, project goes back to draft
}

enum SectionStatus {
  pending         // not started
  in_progress     // being written
  completed       // filled and ready
  needs_revision  // reviewer asked for changes
}

enum VoteChoice {
  for
  against
  abstain
}

enum ProjectType {
  agricultural
  industrial
  infrastructure
  energy
  housing
  trading         // keep existing from ProjectCategory
}

enum PaymentProvider {
  stripe
  paypal
}

enum PaymentStatus {
  pending
  completed
  failed
  refunded
}
```

---

## New models to add

### StudyDepartmentTemplate
Pre-defined section templates per project type. Admins can customize but these are the defaults.

```prisma
model StudyDepartmentTemplate {
  id          Int         @id @default(autoincrement())
  projectType ProjectType
  name        String      // e.g. "Soil Study", "Engineering Survey"
  description String?     // guidance for the person filling this section
  isRequired  Boolean     @default(true)
  order       Int         // display order within the project type
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}
```

### ProjectStudy
One study per project. Linked 1-to-1 with Project.

```prisma
model ProjectStudy {
  id              Int           @id @default(autoincrement())
  projectId       Int           @unique
  project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  status          StudyStatus   @default(draft)
  summary         String?       // executive summary written by admin
  publishedAt     DateTime?     // when status moved to published
  votingStartsAt  DateTime?     // scheduled vote start
  votingEndsAt    DateTime?     // scheduled vote end
  approvedById    Int?          // FK → Admin who gave final approval
  approvedAt      DateTime?
  rejectionReason String?
  createdById     Int           // FK → Admin who created the study
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  sections        StudySection[]
  votes           StudyVote[]
}
```

### StudySection
Each department section inside a study.

```prisma
model StudySection {
  id          Int           @id @default(autoincrement())
  studyId     Int
  study       ProjectStudy  @relation(fields: [studyId], references: [id], onDelete: Cascade)
  name        String        // department name
  description String?       // guidance
  content     String?       // rich text / markdown written by the responsible person
  status      SectionStatus @default(pending)
  order       Int
  isRequired  Boolean       @default(true)
  assignedTo  Int?          // FK → Admin responsible for this section
  completedAt DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  files       StudySectionFile[]
}
```

### StudySectionFile
Files attached to a study section (PDFs, images, reports).

```prisma
model StudySectionFile {
  id        Int          @id @default(autoincrement())
  sectionId Int
  section   StudySection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  name      String
  url       String
  fileType  FileType
  createdAt DateTime     @default(now())
}
```

### StudyVote
Each vote cast by a participant or admin on a published study.

```prisma
model StudyVote {
  id        Int          @id @default(autoincrement())
  studyId   Int
  study     ProjectStudy @relation(fields: [studyId], references: [id], onDelete: Cascade)
  userId    Int          // FK → User (any role can vote)
  choice    VoteChoice
  comment   String?      // optional reason
  createdAt DateTime     @default(now())

  @@unique([studyId, userId])  // one vote per user per study
}
```

### OnlineDonation
Payment record for Stripe/PayPal donations (supplements existing ProjectDonation).

```prisma
model OnlineDonation {
  id                Int             @id @default(autoincrement())
  projectId         Int
  project           Project         @relation(fields: [projectId], references: [id])
  participantId     Int?            // null if anonymous
  participant       Participant?    @relation(fields: [participantId], references: [id])
  amount            Decimal
  currency          String          @default("USD")
  provider          PaymentProvider
  providerSessionId String          @unique  // Stripe checkout session ID or PayPal order ID
  providerPaymentId String?         // filled after payment confirmed
  status            PaymentStatus   @default(pending)
  metadata          Json?           // store provider-specific data
  paidAt            DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}
```

---

## Modifications to existing models

### Add to `Project` model:
```prisma
study           ProjectStudy?
onlineDonations OnlineDonation[]
// Also add a new status field:
studyStatus     StudyStatus?    // mirrors ProjectStudy.status for easy filtering
```

### Add to `Participant` model:
```prisma
studyVotes      StudyVote[]
onlineDonations OnlineDonation[]
```

---

## Seed data to add in `packages/database/prisma/seed.ts`

After schema changes, add seed data for `StudyDepartmentTemplate` covering all 5 project types. Each type should have 6–8 sections. Follow the section names from the architecture document:

- **agricultural**: Soil Study, Water Access, Crop Planning, Climate & Season, Financial Estimate, Legal & Land, Community Impact
- **industrial**: Technical Design, Environmental Study, Safety & Risk, Supply Chain, Budget & ROI, Legal Permits, Job Creation Report
- **infrastructure**: Engineering Study, Ground Survey, Disaster Resilience, Maintenance Plan, Cost & Funding, Affected Population, Reconstruction Priority
- **energy**: Power Demand Study, Technology Choice, Grid Connection, Storage & Distribution, Environmental Assessment, Cost per kWh, Operator Training
- **housing**: Structural Design, Land Ownership, Beneficiary List, Material Supply, Sanitation Plan, Budget per Unit, Displacement Impact

All types share these (add to every type): Financial Overview, Legal Compliance, Social Impact Assessment, Project Timeline

---

## Migration name

```bash
pnpm --filter @helping-hands/database db:migrate:dev -- --name add_study_voting_payment_system
```

## Verification

After migration, run Prisma Studio and confirm:
- All 5 new tables exist
- StudyDepartmentTemplate has rows for all project types
- Foreign keys are correct
- The `@@unique` constraint on StudyVote works

```bash
pnpm db:studio
```
