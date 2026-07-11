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

  // ─── W6 municipal integration ───────────────────────────────────────────────
  // Joint projects: participations and project-scope grants are managed by
  // the OWNER org (resource resolves projectId → owning organization) or the
  // Board — a participating org cannot expand its own access.
  'project.participation.manage': {
    anyGrants: [
      { scopeType: 'organization', roles: ['org_admin', 'project_manager'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member'] },
    ],
    sensitive: true,
  },
  // Execution surfaces: owner-org staff plus individually admitted
  // project-scope grant holders (contributor et al.) — the cross-org channel.
  'project.execute': {
    anyGrants: [
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'staff'] },
      { scopeType: 'project', roles: ['project_lead', 'contributor'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
  },
  // Emergency-relief fast track is Board-initiated only (W6-E4-S2).
  'project.emergency.create': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
    sensitive: true,
  },
  // Org verification transitions (W6-E3): Board only.
  'organization.verify': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
    sensitive: true,
  },
  // Funding agreements: Board manages; fund officers read via fund.read; the
  // counterpart org reads its own (resource organizationId).
  'agreement.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair'] }],
    sensitive: true,
  },
  'agreement.read': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'org_accountant', 'staff', 'viewer'] },
    ],
  },
  // Reporting (W6-E1-S3/E6): orgs submit, the Board reviews.
  'org.report.submit': {
    anyGrants: [
      { scopeType: 'organization', roles: ['org_admin', 'project_manager'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
    sensitive: true,
  },
  'org.report.read': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'org_accountant', 'staff', 'viewer'] },
    ],
  },
  'report.review': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair', 'board_member'] }],
    sensitive: true,
  },

  // ─── W7 transparency ─────────────────────────────────────────────────────────
  // Publication-policy changes are the Board opening/closing public data
  // classes — chair-level, every change audited.
  'publication.policy.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['board_chair'] }],
    sensitive: true,
  },

  // ─── W8 fund financial extension ───────────────────────────────────────────
  // Donor: staff-managed master data (name, tax id, contact) — Board or a
  // fund's own record-keeping officers manage it; read is fund-officer/Board,
  // same shape as fund.read (a donor is only interesting in the context of
  // the fund(s) it backs).
  'donor.manage': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair'] },
      { scopeType: 'fund', roles: ['fund_director', 'fund_secretary'] },
    ],
    sensitive: true,
  },
  'donor.read': {
    anyGrants: [
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'] },
    ],
  },
  // Fund donations: Donor → FundDonation → Fund → FundAllocation → Project.
  // Recording is the fund's bookkeeping roles; confirming (approve/reject) —
  // which posts the ledger credit — is narrower, mirroring allocation.disburse.
  'fund_donation.record': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
    sensitive: true,
  },
  'fund_donation.decide': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_accountant'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member'] },
    ],
    sensitive: true,
  },
  'fund_donation.read': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
    ],
  },
  // Expenses (+ their recipients/invoices): submission is wide — a fund's own
  // officers, or the executing org's project staff — approval (which posts
  // the ledger debit) is narrow, mirroring expense.decide's org-scope shape
  // plus the fund-scope accountant/director roles a fund-sourced expense adds.
  'fund_expense.create': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant'] },
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'staff', 'org_accountant'] },
      { scopeType: 'platform', roles: ['board_chair'] },
    ],
  },
  'fund_expense.decide': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_accountant'] },
      { scopeType: 'organization', roles: ['org_admin', 'org_accountant'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member'] },
    ],
    sensitive: true,
  },
  'fund_expense.read': {
    anyGrants: [
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'] },
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'] },
      { scopeType: 'platform', roles: ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
    ],
  },

  // ─── W9 — sector taxonomy & fund-suggestion (system structure, Super Admin) ─
  // Sector CRUD is system-level structure, deliberately narrower than
  // fund.manage/organization.manage — only Super Admin, never board_chair.
  'sector.manage': {
    anyGrants: [{ scopeType: 'platform', roles: ['super_admin'] }],
    sensitive: true,
  },
  // Narrow, non-sensitive read (id/name/type only, no balances) so org staff
  // can see candidate funds while creating a project — fund.read does not
  // grant organization-scope roles at all, and shouldn't (it also exposes
  // balances/allocations), so this is a separate, smaller action.
  'fund.suggest': {
    anyGrants: [
      { scopeType: 'organization', roles: ['org_admin', 'project_manager', 'staff'] },
      { scopeType: 'platform', roles: ['super_admin', 'board_chair', 'board_member', 'board_secretary', 'platform_auditor'] },
      { scopeType: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'] },
    ],
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
  'GET /api/v1/funds/hierarchy': 'fund.read',
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
  'GET /api/v1/governance/verification-queue': 'governance.read',
  'POST /api/v1/governance/rounds': 'governance.round.manage',
  'GET /api/v1/governance/rounds': 'governance.read',
  'GET /api/v1/governance/rounds/:id': 'governance.read',
  'POST /api/v1/governance/rounds/:id/votes': 'governance.vote',
  'PATCH /api/v1/governance/rounds/:id/close': 'governance.round.manage',
  // W6 joint projects: participation management is owner-org/Board; the
  // working set (incl. project-scope grant holders) reads and executes.
  'GET /api/v1/projects/:projectId/participations': 'project.execute',
  'GET /api/v1/projects/:projectId/participations/assignable-users': 'project.execute',
  'POST /api/v1/projects/:projectId/participations': 'project.participation.manage',
  'POST /api/v1/projects/:projectId/participations/:participationId/end': 'project.participation.manage',
  'POST /api/v1/projects/:projectId/participations/grants': 'project.participation.manage',
  'DELETE /api/v1/projects/:projectId/participations/grants/:userId/:role': 'project.participation.manage',
  // W6 cross-org execution: project-scope contributors work these surfaces
  'GET /api/v1/projects/:projectId/execution/steps': 'project.execute',
  'POST /api/v1/projects/:projectId/execution/steps': 'project.execute',
  'PATCH /api/v1/projects/:projectId/execution/steps/:id': 'project.execute',
  'PATCH /api/v1/projects/:projectId/execution/steps/:id/progress': 'project.execute',
  'DELETE /api/v1/projects/:projectId/execution/steps/:id': 'project.execute',
  'GET /api/v1/projects/:projectId/execution/phases': 'project.execute',
  'POST /api/v1/projects/:projectId/execution/phases': 'project.execute',
  'PATCH /api/v1/projects/:projectId/execution/phases/:id': 'project.execute',
  'DELETE /api/v1/projects/:projectId/execution/phases/:id': 'project.execute',
  'GET /api/v1/projects/:projectId/execution/tasks': 'project.execute',
  'POST /api/v1/projects/:projectId/execution/tasks': 'project.execute',
  'PATCH /api/v1/projects/:projectId/execution/tasks/:id': 'project.execute',
  'DELETE /api/v1/projects/:projectId/execution/tasks/:id': 'project.execute',
  // W6 org verification (Board)
  'POST /api/v1/organizations/:id/verification/begin-review': 'organization.verify',
  'POST /api/v1/organizations/:id/verification/verify': 'organization.verify',
  'POST /api/v1/organizations/:id/verification/reject': 'organization.verify',
  'POST /api/v1/organizations/:id/verification/activate': 'organization.verify',
  // W6 funding agreements
  'POST /api/v1/funds/:id/agreements': 'agreement.manage',
  'GET /api/v1/funds/:id/agreements': 'fund.read',
  'POST /api/v1/funds/agreements/:agreementId/sign': 'agreement.manage',
  'PATCH /api/v1/funds/agreements/:agreementId/status': 'agreement.manage',
  'GET /api/v1/funds/agreements/:agreementId': 'agreement.read',
  'GET /api/v1/organizations/:id/agreements': 'agreement.read',
  // W6 reporting
  'POST /api/v1/organizations/:id/reports': 'org.report.submit',
  'GET /api/v1/organizations/:id/reports': 'org.report.read',
  'POST /api/v1/org-reports/:id/resubmit': 'org.report.submit',
  'POST /api/v1/org-reports/:id/begin-review': 'report.review',
  'POST /api/v1/org-reports/:id/accept': 'report.review',
  'POST /api/v1/org-reports/:id/return': 'report.review',
  'GET /api/v1/org-reports/queue': 'governance.read',
  // W7 transparency (public routes need no mapping; these are workspace/Board)
  'GET /api/v1/transparency-policy': 'governance.read',
  'PATCH /api/v1/transparency-policy/:fieldClass': 'publication.policy.manage',
  'GET /api/v1/dashboards/board': 'governance.read',
  'GET /api/v1/dashboards/funds/:id/trends': 'fund.read',
  'GET /api/v1/transparency/exports/projects/:id/statement.csv': 'project.execute',
  'GET /api/v1/transparency/exports/organizations/:id/summary.csv': 'org.report.read',

  // W8 fund financial extension
  'POST /api/v1/donors': 'donor.manage',
  'PUT /api/v1/donors/:id': 'donor.manage',
  'GET /api/v1/donors': 'donor.read',
  'GET /api/v1/donors/:id': 'donor.read',
  'GET /api/v1/donors/:id/report': 'donor.read',
  'POST /api/v1/funds/:id/donations': 'fund_donation.record',
  'GET /api/v1/funds/:id/donations': 'fund_donation.read',
  'POST /api/v1/funds/donations/:donationId/approve': 'fund_donation.decide',
  'POST /api/v1/funds/donations/:donationId/reject': 'fund_donation.decide',
  'POST /api/v1/expenses': 'fund_expense.create',
  'GET /api/v1/expenses': 'fund_expense.read',
  'GET /api/v1/expenses/stage-summary': 'fund_expense.read',
  'GET /api/v1/expenses/:id': 'fund_expense.read',
  'POST /api/v1/expenses/:id/approve': 'fund_expense.decide',
  'POST /api/v1/expenses/:id/reject': 'fund_expense.decide',
  'POST /api/v1/expenses/:id/mark-paid': 'fund_expense.decide',
  'POST /api/v1/expenses/:id/invoice': 'fund_expense.create',
  'POST /api/v1/recipients': 'fund_expense.create',
  'GET /api/v1/recipients': 'fund_expense.read',
  'GET /api/v1/recipients/:id': 'fund_expense.read',
  'PUT /api/v1/recipients/:id': 'fund_expense.create',
  'POST /api/v1/invoices': 'fund_expense.create',
  'GET /api/v1/invoices/:id': 'fund_expense.read',

  // W9 — sectors & fund suggestion
  'GET /api/v1/categories/admin-tree': 'sector.manage',
  'POST /api/v1/categories': 'sector.manage',
  'PATCH /api/v1/categories/:id': 'sector.manage',
  'POST /api/v1/categories/:id/archive': 'sector.manage',
  'POST /api/v1/categories/:id/activate': 'sector.manage',
  'GET /api/v1/funds/suggested': 'fund.suggest',
};
