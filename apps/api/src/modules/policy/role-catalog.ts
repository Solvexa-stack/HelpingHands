import { RoleScopeType } from '@prisma/client';

/**
 * W1-E4-S1 — role catalogs per scope (08_PERMISSIONS_RBAC_ABAC.md).
 * Extendable data, stable keys.
 */
export const ROLE_CATALOG: Record<RoleScopeType, readonly string[]> = {
  // W9 — `super_admin` is deliberately separate from `board_chair`: it owns
  // system-level structure (sectors, master funds, global fund shape),
  // while board_chair keeps governance/approval authority. See
  // workspaceroadmap/20_WAVE_9_FUND_HIERARCHY_AND_SECTOR_GOVERNANCE.md.
  platform: ['super_admin', 'board_chair', 'board_member', 'board_secretary', 'platform_auditor'],
  organization: ['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'],
  fund: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'],
  project: ['project_lead', 'contributor', 'financial_delegate'],
};

/**
 * Legacy AdminRole → grants equivalence used during shadow mode to translate
 * `@Roles(...)` lists into policy requirements. Mirrors the W1-E3 backfill.
 */
export const LEGACY_ROLE_GRANTS: Record<
  string,
  Array<{ scopeType: RoleScopeType; role: string }>
> = {
  administrator: [
    { scopeType: 'platform', role: 'board_chair' },
    { scopeType: 'organization', role: 'org_admin' },
  ],
  employee: [{ scopeType: 'organization', role: 'staff' }],
  financial_officer: [{ scopeType: 'organization', role: 'org_accountant' }],
};
