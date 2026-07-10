-- CreateEnum
CREATE TYPE "ParticipationRole" AS ENUM ('owner', 'executing_agency', 'funding_partner', 'supervising', 'beneficiary_rep');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "FundingAgreementStatus" AS ENUM ('draft', 'active', 'suspended', 'completed', 'terminated');

-- CreateEnum
CREATE TYPE "OrgReportType" AS ENUM ('progress', 'financial');

-- CreateEnum
CREATE TYPE "OrgReportStatus" AS ENUM ('submitted', 'under_review', 'accepted', 'returned');

-- AlterTable
ALTER TABLE "fund_allocations" ADD COLUMN     "funding_agreement_id" INTEGER;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "category_id" INTEGER,
ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "study_department_templates" ADD COLUMN     "category_node_id" INTEGER,
ALTER COLUMN "project_type" DROP NOT NULL;

-- CreateTable
CREATE TABLE "project_participations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "role" "ParticipationRole" NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "project_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_agreements" (
    "id" SERIAL NOT NULL,
    "fund_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "terms" JSONB NOT NULL DEFAULT '{}',
    "reporting_schedule" JSONB NOT NULL DEFAULT '{}',
    "status" "FundingAgreementStatus" NOT NULL DEFAULT 'draft',
    "signed_at" TIMESTAMP(3),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "funding_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_reports" (
    "id" SERIAL NOT NULL,
    "type" "OrgReportType" NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "funding_agreement_id" INTEGER,
    "title" VARCHAR(500) NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "OrgReportStatus" NOT NULL DEFAULT 'submitted',
    "submitted_by_user_id" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "organization_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_category_nodes" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "parent_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255),
    "name_fr" VARCHAR(255),
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_category" "ProjectCategory",
    "legacy_project_type" "ProjectType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_category_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_participations_organization_id_idx" ON "project_participations"("organization_id");

-- CreateIndex
CREATE INDEX "project_participations_project_id_idx" ON "project_participations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_participations_project_id_organization_id_role_key" ON "project_participations"("project_id", "organization_id", "role");

-- CreateIndex
CREATE INDEX "funding_agreements_fund_id_idx" ON "funding_agreements"("fund_id");

-- CreateIndex
CREATE INDEX "funding_agreements_organization_id_idx" ON "funding_agreements"("organization_id");

-- CreateIndex
CREATE INDEX "funding_agreements_status_idx" ON "funding_agreements"("status");

-- CreateIndex
CREATE INDEX "organization_reports_organization_id_idx" ON "organization_reports"("organization_id");

-- CreateIndex
CREATE INDEX "organization_reports_funding_agreement_id_idx" ON "organization_reports"("funding_agreement_id");

-- CreateIndex
CREATE INDEX "organization_reports_status_idx" ON "organization_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_category_nodes_key_key" ON "project_category_nodes"("key");

-- CreateIndex
CREATE INDEX "project_category_nodes_parent_id_idx" ON "project_category_nodes"("parent_id");

-- CreateIndex
CREATE INDEX "fund_allocations_funding_agreement_id_idx" ON "fund_allocations"("funding_agreement_id");

-- CreateIndex
CREATE INDEX "projects_category_id_idx" ON "projects"("category_id");

-- CreateIndex
CREATE INDEX "study_department_templates_category_node_id_idx" ON "study_department_templates"("category_node_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "project_category_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_department_templates" ADD CONSTRAINT "study_department_templates_category_node_id_fkey" FOREIGN KEY ("category_node_id") REFERENCES "project_category_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_funding_agreement_id_fkey" FOREIGN KEY ("funding_agreement_id") REFERENCES "funding_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participations" ADD CONSTRAINT "project_participations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participations" ADD CONSTRAINT "project_participations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_agreements" ADD CONSTRAINT "funding_agreements_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_agreements" ADD CONSTRAINT "funding_agreements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_reports" ADD CONSTRAINT "organization_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_reports" ADD CONSTRAINT "organization_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_reports" ADD CONSTRAINT "organization_reports_funding_agreement_id_fkey" FOREIGN KEY ("funding_agreement_id") REFERENCES "funding_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_category_nodes" ADD CONSTRAINT "project_category_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_category_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
