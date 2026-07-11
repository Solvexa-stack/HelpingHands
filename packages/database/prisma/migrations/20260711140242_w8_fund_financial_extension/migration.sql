-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('organization', 'council', 'donor');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('person', 'company', 'organization');

-- CreateEnum
CREATE TYPE "FundDonationMethod" AS ENUM ('cash', 'bank_transfer', 'check', 'card', 'online');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('materials', 'labor', 'services', 'equipment', 'transport', 'administrative', 'other');

-- AlterTable
-- Every existing fund backfills to 'organization' via the column default —
-- safe no-op for the current data (verified before writing this migration:
-- 5 funds, none reference a council-type organization or need reclassifying
-- as donor-owned; that requires a Donor row, which cannot exist for
-- historical data). The UPDATE below promotes any fund already managed by a
-- council-type organization, so the migration stays correct even if a
-- 'council' organization is created between this deploy and the next.
ALTER TABLE "funds" ADD COLUMN     "donor_id" INTEGER,
ADD COLUMN     "type" "FundType" NOT NULL DEFAULT 'organization';

UPDATE "funds" f
SET "type" = 'council'
WHERE f."managing_organization_id" IN (
  SELECT o."id" FROM "organizations" o WHERE o."type" = 'council'
);

-- CreateTable
CREATE TABLE "donors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "PartyType" NOT NULL DEFAULT 'person',
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "contact_address" TEXT,
    "tax_id" VARCHAR(100),
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_donations" (
    "id" SERIAL NOT NULL,
    "fund_id" INTEGER NOT NULL,
    "donor_id" INTEGER,
    "participant_id" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "payment_method" "FundDonationMethod" NOT NULL,
    "reference_number" VARCHAR(255),
    "donated_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'pending',
    "created_by_user_id" INTEGER NOT NULL,
    "approved_by_user_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "PartyType" NOT NULL DEFAULT 'person',
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "contact_address" TEXT,
    "organization_id" INTEGER,
    "tax_id" VARCHAR(100),
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(255) NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "recipient_id" INTEGER,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "file_mime_type" VARCHAR(100),
    "file_size" INTEGER,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "fund_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "created_by_user_id" INTEGER NOT NULL,
    "approved_by_user_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donors_type_idx" ON "donors"("type");

-- CreateIndex
CREATE INDEX "fund_donations_fund_id_idx" ON "fund_donations"("fund_id");

-- CreateIndex
CREATE INDEX "fund_donations_donor_id_idx" ON "fund_donations"("donor_id");

-- CreateIndex
CREATE INDEX "fund_donations_participant_id_idx" ON "fund_donations"("participant_id");

-- CreateIndex
CREATE INDEX "fund_donations_status_idx" ON "fund_donations"("status");

-- CreateIndex
CREATE INDEX "recipients_type_idx" ON "recipients"("type");

-- CreateIndex
CREATE INDEX "recipients_organization_id_idx" ON "recipients"("organization_id");

-- CreateIndex
CREATE INDEX "invoices_recipient_id_idx" ON "invoices"("recipient_id");

-- CreateIndex
CREATE INDEX "expenses_fund_id_idx" ON "expenses"("fund_id");

-- CreateIndex
CREATE INDEX "expenses_project_id_idx" ON "expenses"("project_id");

-- CreateIndex
CREATE INDEX "expenses_recipient_id_idx" ON "expenses"("recipient_id");

-- CreateIndex
CREATE INDEX "expenses_invoice_id_idx" ON "expenses"("invoice_id");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "funds_type_idx" ON "funds"("type");

-- CreateIndex
CREATE INDEX "online_donations_fund_id_idx" ON "online_donations"("fund_id");

-- AddForeignKey
ALTER TABLE "online_donations" ADD CONSTRAINT "online_donations_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donors" ADD CONSTRAINT "donors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_donations" ADD CONSTRAINT "fund_donations_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_donations" ADD CONSTRAINT "fund_donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_donations" ADD CONSTRAINT "fund_donations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_donations" ADD CONSTRAINT "fund_donations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_donations" ADD CONSTRAINT "fund_donations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
