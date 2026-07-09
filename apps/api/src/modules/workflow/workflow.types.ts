/** W4-E1 — engine vocabulary (04_WORKFLOW_ENGINE.md). */

export interface WorkflowSubject {
  subjectType: string; // 'project' | 'organization' | 'fund_allocation' | …
  subjectId: number;
}

/** Guard rows as stored on transitions — handlers are code, usage is data. */
export type GuardRef =
  | { type: 'role'; anyOf: Array<{ scope: 'platform' | 'organization' | 'fund'; roles: string[] }> }
  | { type: 'capability'; cap: string }
  | { type: 'vote_passed' }
  | { type: 'board_decision'; decision: 'approved' | 'rejected' | 'changes_requested' }
  | { type: 'sections_complete' }
  | { type: 'window_open'; field: 'voting'; mustBeClosed?: boolean };

export interface GuardVerdict {
  pass: boolean;
  reason: string; // e.g. "granted:role" | "denied:board_decision:approved missing"
}

export interface AvailableTransition {
  actionKey: string;
  toStateKey: string;
  allowed: boolean;
  deniedBy: string | null; // first failing guard reason
}

/**
 * Cutover flag (W4-E4): WORKFLOW_ENFORCED master switch, optionally narrowed
 * to a comma-separated service list via WORKFLOW_SERVICES
 * (study,voting,projects,execution) for the one-service-per-deploy rollout.
 */
export function workflowEnforced(service: 'study' | 'voting' | 'projects' | 'execution'): boolean {
  if (process.env.WORKFLOW_ENFORCED !== 'true') return false;
  const services = process.env.WORKFLOW_SERVICES;
  if (!services) return true;
  return services.split(',').map((s) => s.trim()).includes(service);
}
