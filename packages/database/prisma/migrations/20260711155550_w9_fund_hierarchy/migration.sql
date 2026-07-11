-- AlterEnum
ALTER TYPE "FundType" ADD VALUE 'master';

-- AlterTable
ALTER TABLE "funds" ADD COLUMN     "category_id" INTEGER,
ADD COLUMN     "parent_fund_id" INTEGER;

-- CreateIndex
CREATE INDEX "funds_category_id_idx" ON "funds"("category_id");

-- CreateIndex
CREATE INDEX "funds_parent_fund_id_idx" ON "funds"("parent_fund_id");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "project_category_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_parent_fund_id_fkey" FOREIGN KEY ("parent_fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
