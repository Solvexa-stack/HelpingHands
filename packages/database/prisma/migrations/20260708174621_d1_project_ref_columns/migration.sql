-- AlterTable
ALTER TABLE "project_budgets" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_expenses" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_milestones" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_phases" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_steps" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN     "project_ref_id" INTEGER;

-- AlterTable
ALTER TABLE "project_transactions" ADD COLUMN     "project_ref_id" INTEGER;

-- CreateIndex
CREATE INDEX "project_budgets_project_ref_id_idx" ON "project_budgets"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_expenses_project_ref_id_idx" ON "project_expenses"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_milestones_project_ref_id_idx" ON "project_milestones"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_phases_project_ref_id_idx" ON "project_phases"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_steps_project_ref_id_idx" ON "project_steps"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_tasks_project_ref_id_idx" ON "project_tasks"("project_ref_id");

-- CreateIndex
CREATE INDEX "project_transactions_project_ref_id_idx" ON "project_transactions"("project_ref_id");

-- AddForeignKey
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_ref_id_fkey" FOREIGN KEY ("project_ref_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- W2-E1-S1: backfill via the Block↔Project 1:1 (legacy project_id holds the
-- project's block id), then verify count(legacy) = count(new) per table.
DO $$
DECLARE t text; legacy_count bigint; new_count bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_steps','project_phases','project_tasks',
                           'project_budgets','project_expenses',
                           'project_transactions','project_milestones'] LOOP
    EXECUTE format(
      'UPDATE %I SET project_ref_id = p.id FROM projects p WHERE p.block_id = %I.project_id AND %I.project_ref_id IS NULL',
      t, t, t);
    EXECUTE format('SELECT count(*) FROM %I WHERE project_id IS NOT NULL', t) INTO legacy_count;
    EXECUTE format('SELECT count(*) FROM %I WHERE project_ref_id IS NOT NULL', t) INTO new_count;
    IF legacy_count <> new_count THEN
      RAISE EXCEPTION 'W2-E1-S1 backfill verification failed on %: legacy=% new=%', t, legacy_count, new_count;
    END IF;
    RAISE NOTICE 'W2-E1-S1 %: % rows verified', t, new_count;
  END LOOP;
END
$$;
