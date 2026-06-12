-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('draft', 'in_review', 'published', 'voting_open', 'voting_closed', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('pending', 'in_progress', 'completed', 'needs_revision');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('for', 'against', 'abstain');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('agricultural', 'industrial', 'infrastructure', 'energy', 'housing', 'trading');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('stripe', 'paypal');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "study_status" "StudyStatus";

-- CreateTable
CREATE TABLE "study_department_templates" (
    "id" SERIAL NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_department_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_studies" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "published_at" TIMESTAMP(3),
    "voting_starts_at" TIMESTAMP(3),
    "voting_ends_at" TIMESTAMP(3),
    "approved_by_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sections" (
    "id" SERIAL NOT NULL,
    "study_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "status" "SectionStatus" NOT NULL DEFAULT 'pending',
    "order" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "assigned_to" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_section_files" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "file_type" "FileType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_section_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_votes" (
    "id" SERIAL NOT NULL,
    "study_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_donations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "participant_id" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "provider" "PaymentProvider" NOT NULL,
    "provider_session_id" VARCHAR(500) NOT NULL,
    "provider_payment_id" VARCHAR(500),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_donations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_studies_project_id_key" ON "project_studies"("project_id");

-- CreateIndex
CREATE INDEX "study_sections_study_id_idx" ON "study_sections"("study_id");

-- CreateIndex
CREATE INDEX "study_section_files_section_id_idx" ON "study_section_files"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_votes_study_id_user_id_key" ON "study_votes"("study_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_donations_provider_session_id_key" ON "online_donations"("provider_session_id");

-- CreateIndex
CREATE INDEX "online_donations_project_id_idx" ON "online_donations"("project_id");

-- CreateIndex
CREATE INDEX "online_donations_participant_id_idx" ON "online_donations"("participant_id");

-- CreateIndex
CREATE INDEX "online_donations_status_idx" ON "online_donations"("status");

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sections" ADD CONSTRAINT "study_sections_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "project_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sections" ADD CONSTRAINT "study_sections_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_section_files" ADD CONSTRAINT "study_section_files_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "study_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_votes" ADD CONSTRAINT "study_votes_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "project_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_votes" ADD CONSTRAINT "study_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_donations" ADD CONSTRAINT "online_donations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_donations" ADD CONSTRAINT "online_donations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
