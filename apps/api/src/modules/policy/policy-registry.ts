import { PolicyEntry } from './policy.types';

/**
 * W1-E4 — explicit policies for semantically named actions. Everything not
 * listed here falls back to the legacy `@Roles(...)` translation (see
 * PolicyService.can), so the action mapping is total: explicit entries below
 * + the derivation rule `route:<METHOD> <path>` for the rest.
 */
export const POLICY_REGISTRY: Record<string, PolicyEntry> = {
  // ─── Financial action class (sensitive: decisions audited incl. denials) ───
  'donation.decide': {
    anyGrants: [{ scopeType: 'organization', roles: ['org_admin', 'staff', 'org_accountant'] }],
    sensitive: true,
  },
  'expense.decide': {
    anyGrants: [{ scopeType: 'organization', roles: ['org_admin', 'org_accountant'] }],
    sensitive: true,
  },
  'budget.write': {
    anyGrants: [{ scopeType: 'organization', roles: ['org_admin', 'org_accountant'] }],
    sensitive: true,
  },
  'transaction.write': {
    anyGrants: [{ scopeType: 'organization', roles: ['org_admin', 'org_accountant'] }],
    sensitive: true,
  },

  // ─── Governance action class ────────────────────────────────────────────────
  'organization.capability.set': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair'] }],
    sensitive: true,
  },
  'organization.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair'] }],
    sensitive: true,
  },

  // ─── Capability-conditioned example (08 §policy examples; not yet routed) ───
  'project.donation.open': {
    anyGrants: [{ scopeType: 'organization', roles: ['org_admin', 'project_manager'] }],
    allConditions: ['org_has_capability:canOpenDonations'],
  },
};

/**
 * Route → semantic action overrides. Key: `<METHOD> <express route path>`
 * (with the global prefix). Unlisted authed routes derive
 * `route:<METHOD> <path>` and translate their legacy roles.
 */
export const ROUTE_ACTION_MAP: Record<string, string> = {
  'PATCH /api/v1/donations/:id/status': 'donation.decide',
  'PATCH /api/v1/projects/:projectId/financial/expenses/:id/status': 'expense.decide',
  'POST /api/v1/projects/:projectId/financial/budgets': 'budget.write',
  'PATCH /api/v1/projects/:projectId/financial/budgets/:id': 'budget.write',
  'DELETE /api/v1/projects/:projectId/financial/budgets/:id': 'budget.write',
  'POST /api/v1/projects/:projectId/financial/transactions': 'transaction.write',
  'PATCH /api/v1/organizations/:id/capabilities': 'organization.capability.set',
  'POST /api/v1/organizations': 'organization.manage',
  'PUT /api/v1/organizations/:id': 'organization.manage',
  'POST /api/v1/organizations/:id/members': 'organization.manage',
  'DELETE /api/v1/organizations/:id/members/:userId': 'organization.manage',
};
