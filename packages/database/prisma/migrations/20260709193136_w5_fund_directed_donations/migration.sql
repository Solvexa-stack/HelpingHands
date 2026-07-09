-- DropForeignKey
ALTER TABLE "online_donations" DROP CONSTRAINT "online_donations_project_id_fkey";

-- AlterTable
ALTER TABLE "online_donations" ADD COLUMN     "fund_id" INTEGER,
ALTER COLUMN "project_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "online_donations" ADD CONSTRAINT "online_donations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
