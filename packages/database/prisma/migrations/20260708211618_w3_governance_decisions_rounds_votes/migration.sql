-- CreateEnum
CREATE TYPE "GovernanceSubjectType" AS ENUM ('project', 'project_study', 'fund_allocation', 'organization', 'policy');

-- CreateEnum
CREATE TYPE "BoardDecisionType" AS ENUM ('approved', 'rejected', 'changes_requested');

-- CreateEnum
CREATE TYPE "VoteRoundStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "board_decisions" (
    "id" SERIAL NOT NULL,
    "subject_type" "GovernanceSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "decision" "BoardDecisionType" NOT NULL,
    "rationale" TEXT NOT NULL,
    "decided_by_user_id" INTEGER NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_ref" VARCHAR(100),
    "vote_round_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_rounds" (
    "id" SERIAL NOT NULL,
    "subject_type" "GovernanceSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "status" "VoteRoundStatus" NOT NULL DEFAULT 'open',
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3),
    "eligibility" JSONB NOT NULL DEFAULT '{"type": "authenticated"}',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vote_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" SERIAL NOT NULL,
    "vote_round_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_decisions_subject_type_subject_id_idx" ON "board_decisions"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "board_decisions_decided_by_user_id_idx" ON "board_decisions"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "vote_rounds_subject_type_subject_id_idx" ON "vote_rounds"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "vote_rounds_status_idx" ON "vote_rounds"("status");

-- CreateIndex
CREATE INDEX "votes_user_id_idx" ON "votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_vote_round_id_user_id_key" ON "votes"("vote_round_id", "user_id");

-- AddForeignKey
ALTER TABLE "board_decisions" ADD CONSTRAINT "board_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_decisions" ADD CONSTRAINT "board_decisions_vote_round_id_fkey" FOREIGN KEY ("vote_round_id") REFERENCES "vote_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_vote_round_id_fkey" FOREIGN KEY ("vote_round_id") REFERENCES "vote_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
