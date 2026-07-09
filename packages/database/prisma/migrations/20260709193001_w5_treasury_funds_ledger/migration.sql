-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('active', 'frozen', 'closed');

-- CreateEnum
CREATE TYPE "AccountOwnerType" AS ENUM ('fund', 'project', 'provider_clearing', 'external');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('asset', 'liability', 'income', 'expense');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "LedgerTransactionStatus" AS ENUM ('pending', 'posted', 'reversed');

-- CreateEnum
CREATE TYPE "FundAllocationStatus" AS ENUM ('proposed', 'board_approved', 'disbursing', 'reconciled', 'closed', 'rejected');

-- CreateTable
CREATE TABLE "funds" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "purpose" TEXT,
    "status" "FundStatus" NOT NULL DEFAULT 'active',
    "managing_organization_id" INTEGER,
    "policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_memberships" (
    "id" SERIAL NOT NULL,
    "fund_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "owner_type" "AccountOwnerType" NOT NULL,
    "owner_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "kind" "AccountKind" NOT NULL DEFAULT 'asset',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" INTEGER,
    "description" TEXT NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" INTEGER,
    "event" VARCHAR(100),
    "status" "LedgerTransactionStatus" NOT NULL DEFAULT 'posted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_allocations" (
    "id" SERIAL NOT NULL,
    "fund_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "FundAllocationStatus" NOT NULL DEFAULT 'proposed',
    "approved_by_decision_id" INTEGER,
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fund_memberships_user_id_idx" ON "fund_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fund_memberships_fund_id_user_id_key" ON "fund_memberships"("fund_id", "user_id");

-- CreateIndex
CREATE INDEX "accounts_owner_type_owner_id_idx" ON "accounts"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_owner_type_name_currency_key" ON "accounts"("owner_type", "name", "currency");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reference_type_reference_id_event_key" ON "ledger_transactions"("reference_type", "reference_id", "event");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries"("account_id");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "fund_allocations_fund_id_idx" ON "fund_allocations"("fund_id");

-- CreateIndex
CREATE INDEX "fund_allocations_project_id_idx" ON "fund_allocations"("project_id");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_managing_organization_id_fkey" FOREIGN KEY ("managing_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_memberships" ADD CONSTRAINT "fund_memberships_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_memberships" ADD CONSTRAINT "fund_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_approved_by_decision_id_fkey" FOREIGN KEY ("approved_by_decision_id") REFERENCES "board_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
