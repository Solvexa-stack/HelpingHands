-- DropForeignKey
ALTER TABLE "project_donations" DROP CONSTRAINT "project_donations_participant_id_fkey";

-- DropForeignKey
ALTER TABLE "project_donations" DROP CONSTRAINT "project_donations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_studies" DROP CONSTRAINT "project_studies_project_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_block_id_fkey";

-- DropForeignKey
ALTER TABLE "study_sections" DROP CONSTRAINT "study_sections_study_id_fkey";

-- DropForeignKey
ALTER TABLE "study_votes" DROP CONSTRAINT "study_votes_study_id_fkey";

-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "blocks" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_budgets" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_donations" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_expenses" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_milestones" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_phases" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_steps" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_studies" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "study_sections" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" INTEGER;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sections" ADD CONSTRAINT "study_sections_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "project_studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_votes" ADD CONSTRAINT "study_votes_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "project_studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
