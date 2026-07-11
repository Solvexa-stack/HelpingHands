-- CreateEnum
CREATE TYPE "ExecutionStage" AS ENUM ('planning', 'procurement', 'execution', 'inspection', 'completion');

-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "participant_id" INTEGER;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "stage" "ExecutionStage";

-- AlterTable
ALTER TABLE "fund_allocations" ADD COLUMN     "stage" "ExecutionStage";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "current_stage" "ExecutionStage";

-- AddForeignKey
ALTER TABLE "donors" ADD CONSTRAINT "donors_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
