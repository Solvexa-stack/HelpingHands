-- CreateEnum
CREATE TYPE "PublicationVisibility" AS ENUM ('public', 'workspace_only', 'never_public');

-- CreateTable
CREATE TABLE "publication_policies" (
    "id" SERIAL NOT NULL,
    "field_class" VARCHAR(100) NOT NULL,
    "visibility" "PublicationVisibility" NOT NULL,
    "description" TEXT,
    "updated_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publication_policies_field_class_key" ON "publication_policies"("field_class");
