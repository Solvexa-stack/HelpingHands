-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "primary_fund_id" INTEGER;

-- CreateIndex
CREATE INDEX "projects_primary_fund_id_idx" ON "projects"("primary_fund_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_fund_id_fkey" FOREIGN KEY ("primary_fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
