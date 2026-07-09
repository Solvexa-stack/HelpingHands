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

  // ─── W5 fund action class (06/08: segregation of duties is structural) ─────
  'fund.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair'] }],
    sensitive: true,
  },
  'fund.read': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'] },
    ],
  },
  'allocation.propose': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
    sensitive: true,
  },
  'allocation.decide': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
    sensitive: true,
  },
  'allocation.disburse': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
    sensitive: true,
  },
  'allocation.reconcile': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_accountant'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
    sensitive: true,
  },
  // controller = read + flag ONLY: this is the sole fund action the
  // fund_controller role appears in besides fund.read
  'ledger.flag': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_controller', 'fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'platform_auditor'] },
    ],
    sensitive: true,
  },

  // ─── W3 governance action class (07: board roles, all sensitive) ────────────
  'governance.decide': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
    sensitive: true,
  },
  'governance.round.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_secretary'] }],
    sensitive: true,
  },
  'governance.vote': {
    // Round-level eligibility is evaluated in the service; the route itself is
    // open to any authenticated user (study rounds transcribe today's electorate).
    authenticatedOnly: true,
  },
  'governance.read': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
    ],
  },
  // W3: study governance transitions require Board roles, replacing the
  // legacy administrator-enum gate (D5 finding closed).
  'study.govern': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
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
  // Platform-only reads: without these mappings the legacy @Roles(administrator)
  // translation (org_admin@organization) lets tenants read cross-org surfaces
  // when the route carries no org resource (isolation leak, found post-W3).
  'GET /api/v1/organizations': 'organization.manage',
  'GET /api/v1/audit': 'governance.read',
  'GET /api/v1/audit/:id': 'governance.read',
  // W5 funds & treasury
  'POST /api/v1/funds': 'fund.manage',
  'PUT /api/v1/funds/:id': 'fund.manage',
  'POST /api/v1/funds/:id/officers': 'fund.manage',
  'DELETE /api/v1/funds/:id/officers/:userId/:role': 'fund.manage',
  'GET /api/v1/funds': 'fund.read',
  'GET /api/v1/funds/:id': 'fund.read',
  'GET /api/v1/funds/:id/dashboard': 'fund.read',
  'POST /api/v1/funds/:id/allocations': 'allocation.propose',
  'POST /api/v1/funds/allocations/:allocationId/approve': 'allocation.decide',
  'POST /api/v1/funds/allocations/:allocationId/reject': 'allocation.decide',
  'POST /api/v1/funds/allocations/:allocationId/disburse': 'allocation.disburse',
  'POST /api/v1/funds/allocations/:allocationId/reconcile': 'allocation.reconcile',
  'POST /api/v1/funds/allocations/:allocationId/close': 'allocation.reconcile',
  'POST /api/v1/treasury/transactions/:id/flag': 'ledger.flag',
  // W3 governance
  'POST /api/v1/governance/decisions': 'governance.decide',
  'GET /api/v1/governance/decisions': 'governance.read',
  'GET /api/v1/governance/queue': 'governance.read',
  'POST /api/v1/governance/rounds': 'governance.round.manage',
  'GET /api/v1/governance/rounds': 'governance.read',
  'GET /api/v1/governance/rounds/:id': 'governance.read',
  'POST /api/v1/governance/rounds/:id/votes': 'governance.vote',
  'PATCH /api/v1/governance/rounds/:id/close': 'governance.round.manage',
};
