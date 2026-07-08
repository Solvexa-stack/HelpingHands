-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" INTEGER,
    "actor_org_id" INTEGER,
    "action" VARCHAR(255) NOT NULL,
    "subject_type" VARCHAR(100) NOT NULL,
    "subject_id" VARCHAR(100) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" VARCHAR(128) NOT NULL,
    "ip" VARCHAR(64),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_subject_type_subject_id_idx" ON "audit_logs"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_request_id_action_subject_type_subject_id_key" ON "audit_logs"("request_id", "action", "subject_type", "subject_id");

-- Append-only enforcement (W0-E3-S1, "start honest"): if a dedicated app role
-- exists, it may INSERT and SELECT but never UPDATE or DELETE audit rows.
-- Full enforcement (separate migration role) lands in Wave 8.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helping_hands_app') THEN
    REVOKE ALL ON TABLE "audit_logs" FROM "helping_hands_app";
    GRANT SELECT, INSERT ON TABLE "audit_logs" TO "helping_hands_app";
    GRANT USAGE ON SEQUENCE "audit_logs_id_seq" TO "helping_hands_app";
  END IF;
END
$$;
