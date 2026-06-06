-- Add explicit FK columns to users for proper Prisma relations
ALTER TABLE "users" ADD COLUMN "admin_id" INTEGER;
ALTER TABLE "users" ADD COLUMN "participant_id" INTEGER;

ALTER TABLE "users" ADD CONSTRAINT "users_admin_id_key" UNIQUE ("admin_id");
ALTER TABLE "users" ADD CONSTRAINT "users_participant_id_key" UNIQUE ("participant_id");

ALTER TABLE "users" ADD CONSTRAINT "users_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Populate from existing polymorphic reference_id / reference_type data
UPDATE "users" SET "admin_id" = "reference_id" WHERE "reference_type" = 'admin';
UPDATE "users" SET "participant_id" = "reference_id" WHERE "reference_type" = 'participant';
