-- W9 — "avoid duplicate funds" as a real DB constraint, not just the
-- application-level find-or-create in FundHierarchyService (belt-and-
-- suspenders under concurrent requests, same reasoning as every other
-- uniqueness guard in this schema). Partial indexes because a plain
-- UNIQUE(category_id, managing_organization_id) would not catch duplicate
-- master funds — managing_organization_id is NULL for every master fund,
-- and Postgres never treats two NULLs as equal in a standard unique index.
-- Split into its own migration because Postgres will not let a freshly
-- ALTER TYPE-added enum value ('master', added in the previous migration)
-- be used in a WHERE clause within the same transaction that added it.

-- At most one master fund per category.
CREATE UNIQUE INDEX "funds_one_master_per_category"
  ON "funds" ("category_id")
  WHERE "type" = 'master' AND "deleted_at" IS NULL;

-- At most one organization fund per (category, organization) pair.
CREATE UNIQUE INDEX "funds_one_org_fund_per_category_org"
  ON "funds" ("category_id", "managing_organization_id")
  WHERE "type" = 'organization' AND "deleted_at" IS NULL AND "category_id" IS NOT NULL;
