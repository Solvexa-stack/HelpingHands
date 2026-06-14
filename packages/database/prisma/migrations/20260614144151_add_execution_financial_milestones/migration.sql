-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending', 'in_progress', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense', 'refund', 'adjustment');

-- CreateTable
CREATE TABLE "project_steps" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "block_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_phases" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "block_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PhaseStatus" NOT NULL DEFAULT 'pending',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "phase_id" INTEGER,
    "block_id" INTEGER NOT NULL,
    "assigned_to_id" INTEGER,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budgets" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "block_id" INTEGER NOT NULL,
    "estimated_amount" DECIMAL(15,2) NOT NULL,
    "approved_amount" DECIMAL(15,2),
    "actual_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_expenses" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "block_id" INTEGER NOT NULL,
    "budget_id" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "invoice_ref" VARCHAR(255),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_transactions" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "block_id" INTEGER NOT NULL,
    "target_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_steps_project_id_idx" ON "project_steps"("project_id");

-- CreateIndex
CREATE INDEX "project_phases_project_id_idx" ON "project_phases"("project_id");

-- CreateIndex
CREATE INDEX "project_tasks_project_id_idx" ON "project_tasks"("project_id");

-- CreateIndex
CREATE INDEX "project_tasks_phase_id_idx" ON "project_tasks"("phase_id");

-- CreateIndex
CREATE INDEX "project_budgets_project_id_idx" ON "project_budgets"("project_id");

-- CreateIndex
CREATE INDEX "project_expenses_project_id_idx" ON "project_expenses"("project_id");

-- CreateIndex
CREATE INDEX "project_expenses_budget_id_idx" ON "project_expenses"("budget_id");

-- CreateIndex
CREATE INDEX "project_transactions_project_id_idx" ON "project_transactions"("project_id");

-- CreateIndex
CREATE INDEX "project_transactions_reference_type_reference_id_idx" ON "project_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "project_milestones_project_id_idx" ON "project_milestones"("project_id");

-- AddForeignKey
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "project_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
