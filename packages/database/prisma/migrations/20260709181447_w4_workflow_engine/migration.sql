-- CreateEnum
CREATE TYPE "WorkflowStateKind" AS ENUM ('initial', 'normal', 'terminal');

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "subject_type" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_states" (
    "id" SERIAL NOT NULL,
    "definition_id" INTEGER NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "kind" "WorkflowStateKind" NOT NULL DEFAULT 'normal',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" SERIAL NOT NULL,
    "definition_id" INTEGER NOT NULL,
    "from_state_key" VARCHAR(100) NOT NULL,
    "to_state_key" VARCHAR(100) NOT NULL,
    "action_key" VARCHAR(100) NOT NULL,
    "guards" JSONB NOT NULL DEFAULT '[]',
    "effects" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" SERIAL NOT NULL,
    "definition_id" INTEGER NOT NULL,
    "subject_type" VARCHAR(50) NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "current_state_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_logs" (
    "id" SERIAL NOT NULL,
    "instance_id" INTEGER NOT NULL,
    "from_state_key" VARCHAR(100),
    "to_state_key" VARCHAR(100) NOT NULL,
    "action_key" VARCHAR(100) NOT NULL,
    "actor_user_id" INTEGER,
    "note" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_key_version_key" ON "workflow_definitions"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_states_definition_id_key_key" ON "workflow_states"("definition_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_transitions_definition_id_from_state_key_action_ke_key" ON "workflow_transitions"("definition_id", "from_state_key", "action_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instances_subject_type_subject_id_key" ON "workflow_instances"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "workflow_step_logs_instance_id_idx" ON "workflow_step_logs"("instance_id");

-- AddForeignKey
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_logs" ADD CONSTRAINT "workflow_step_logs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "workflow_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
