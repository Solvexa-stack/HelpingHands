-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('ltr', 'rtl');

-- CreateEnum
CREATE TYPE "BlockCategory" AS ENUM ('project', 'blog', 'news', 'event', 'about_us');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('image', 'video', 'pdf');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('administrator', 'employee', 'financial_officer');

-- CreateEnum
CREATE TYPE "Representation" AS ENUM ('personal', 'company', 'organization');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('agricultural', 'industrial', 'trading');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "languages" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "flag_code" VARCHAR(10),
    "direction" "Direction" NOT NULL DEFAULT 'ltr',
    "order_id" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" SERIAL NOT NULL,
    "category" "BlockCategory" NOT NULL,
    "image_url" TEXT,
    "file_url" TEXT,
    "classification" VARCHAR(255),
    "order_id" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_translations" (
    "id" SERIAL NOT NULL,
    "block_id" INTEGER NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "brief" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" SERIAL NOT NULL,
    "reference_id" INTEGER NOT NULL,
    "reference_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255),
    "url" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "file_type" "FileType" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'employee',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "representation" "Representation" NOT NULL DEFAULT 'personal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "reference_id" INTEGER NOT NULL,
    "reference_type" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password" TEXT,
    "avatar" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remember_token" TEXT,
    "joining_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "block_id" INTEGER NOT NULL,
    "location" VARCHAR(255),
    "date_of_completion" TIMESTAMP(3),
    "value" DECIMAL(15,2) NOT NULL,
    "progression" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "category" "ProjectCategory" NOT NULL,
    "expected_start_date" TIMESTAMP(3),
    "financial_officer_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_donations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'pending',
    "qr_token" VARCHAR(255) NOT NULL,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "block_translations_slug_key" ON "block_translations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "block_translations_block_id_language_code_key" ON "block_translations"("block_id", "language_code");

-- CreateIndex
CREATE INDEX "files_reference_id_reference_type_idx" ON "files"("reference_id", "reference_type");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_reference_id_reference_type_idx" ON "users"("reference_id", "reference_type");

-- CreateIndex
CREATE INDEX "users_reference_type_idx" ON "users"("reference_type");

-- CreateIndex
CREATE UNIQUE INDEX "users_reference_id_reference_type_key" ON "users"("reference_id", "reference_type");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_block_id_key" ON "projects"("block_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_donations_qr_token_key" ON "project_donations"("qr_token");

-- CreateIndex
CREATE INDEX "project_donations_project_id_idx" ON "project_donations"("project_id");

-- CreateIndex
CREATE INDEX "project_donations_participant_id_idx" ON "project_donations"("participant_id");

-- CreateIndex
CREATE INDEX "project_donations_status_idx" ON "project_donations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");

-- AddForeignKey
ALTER TABLE "block_translations" ADD CONSTRAINT "block_translations_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_translations" ADD CONSTRAINT "block_translations_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "languages"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_block_fk" FOREIGN KEY ("reference_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_financial_officer_id_fkey" FOREIGN KEY ("financial_officer_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_donations" ADD CONSTRAINT "project_donations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
