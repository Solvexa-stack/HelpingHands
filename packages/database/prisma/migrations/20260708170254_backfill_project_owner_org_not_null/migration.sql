-- W1-E3-S1: idempotent backfill (default org + Board org + project ownership),
-- verification, then NOT NULL. Safe to apply on any environment, fresh or live.

-- Default organization (full capabilities) if missing
INSERT INTO "organizations" ("type", "name", "status", "capabilities", "created_at", "updated_at")
SELECT 'ngo', 'HelpingHands', 'active',
       '{"canExecuteProjects":true,"canReceivePublicFunds":true,"canOpenDonations":true,"isGovernmentEntity":false,"requiresBoardOversight":false}'::jsonb,
       now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations" WHERE "type" = 'ngo' AND "name" = 'HelpingHands'
);

-- Board organization if missing
INSERT INTO "organizations" ("type", "name", "status", "capabilities", "created_at", "updated_at")
SELECT 'board', 'HelpingHands Board', 'active', '{}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations" WHERE "type" = 'board' AND "name" = 'HelpingHands Board'
);

-- Every unowned project belongs to the default organization
UPDATE "projects"
SET "owner_organization_id" = (
  SELECT id FROM "organizations" WHERE "type" = 'ngo' AND "name" = 'HelpingHands' LIMIT 1
)
WHERE "owner_organization_id" IS NULL;

-- Verification: zero orphan projects before tightening the constraint
DO $$
DECLARE orphans integer;
BEGIN
  SELECT count(*) INTO orphans FROM "projects" WHERE "owner_organization_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'W1-E3-S1 backfill failed: % orphan projects remain', orphans;
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "owner_organization_id" SET NOT NULL;
