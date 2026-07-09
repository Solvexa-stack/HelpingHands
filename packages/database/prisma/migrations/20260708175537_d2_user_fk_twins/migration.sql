-- AlterTable
ALTER TABLE "project_donations" ADD COLUMN     "approved_by_user_id" INTEGER;

-- AlterTable
ALTER TABLE "project_studies" ADD COLUMN     "approved_by_user_id" INTEGER,
ADD COLUMN     "created_by_user_id" INTEGER;

-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN     "assigned_to_user_id" INTEGER;

-- AlterTable
ALTER TABLE "study_sections" ADD COLUMN     "assigned_to_user_id" INTEGER;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_studies" ADD CONSTRAINT "project_studies_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sections" ADD CONSTRAINT "study_sections_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- W2-E2-S1: backfill User-FK twins via the Admin→User link, then verify
-- count(legacy non-null) = count(new non-null) per column.
UPDATE study_sections s SET assigned_to_user_id = u.id
  FROM users u WHERE u.reference_type = 'admin' AND u.reference_id = s.assigned_to
  AND s.assigned_to IS NOT NULL AND s.assigned_to_user_id IS NULL;
UPDATE project_tasks t SET assigned_to_user_id = u.id
  FROM users u WHERE u.reference_type = 'admin' AND u.reference_id = t.assigned_to_id
  AND t.assigned_to_id IS NOT NULL AND t.assigned_to_user_id IS NULL;
UPDATE project_studies st SET created_by_user_id = u.id
  FROM users u WHERE u.reference_type = 'admin' AND u.reference_id = st.created_by_id
  AND st.created_by_user_id IS NULL;
UPDATE project_studies st SET approved_by_user_id = u.id
  FROM users u WHERE u.reference_type = 'admin' AND u.reference_id = st.approved_by_id
  AND st.approved_by_id IS NOT NULL AND st.approved_by_user_id IS NULL;
UPDATE project_donations d SET approved_by_user_id = u.id
  FROM users u WHERE u.reference_type = 'admin' AND u.reference_id = d.approved_by
  AND d.approved_by IS NOT NULL AND d.approved_by_user_id IS NULL;

DO $$
DECLARE pair record; legacy_count bigint; new_count bigint;
BEGIN
  FOR pair IN SELECT * FROM (VALUES
    ('study_sections','assigned_to','assigned_to_user_id'),
    ('project_tasks','assigned_to_id','assigned_to_user_id'),
    ('project_studies','created_by_id','created_by_user_id'),
    ('project_studies','approved_by_id','approved_by_user_id'),
    ('project_donations','approved_by','approved_by_user_id')
  ) AS v(tbl, legacy, twin) LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I IS NOT NULL', pair.tbl, pair.legacy) INTO legacy_count;
    EXECUTE format('SELECT count(*) FROM %I WHERE %I IS NOT NULL', pair.tbl, pair.twin) INTO new_count;
    IF legacy_count <> new_count THEN
      RAISE EXCEPTION 'W2-E2-S1 verification failed on %.%: legacy=% new=%', pair.tbl, pair.twin, legacy_count, new_count;
    END IF;
  END LOOP;
END
$$;
