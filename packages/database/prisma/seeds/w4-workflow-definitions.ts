import { Prisma, PrismaClient } from '@prisma/client';

/**
 * W4-E2-S1 / W4-E6-S1 — workflow definitions as data (04_WORKFLOW_ENGINE.md).
 *
 * `project-lifecycle` v1 is a LINE-BY-LINE TRANSCRIPTION of today's machine:
 *   - VALID_TRANSITIONS in study.service.ts (draft→in_review→published→
 *     voting_open→voting_closed→approved|rejected|in_review, in_review→draft,
 *     voting_open→voting_open to extend the deadline);
 *   - W3 governance: approve/reject carry a matching BoardDecision;
 *     changes_requested returns in_review|voting_closed → draft;
 *   - governance targets are gated on Board roles (study.govern semantics);
 *     submit/revise are open to org members and the Board;
 *   - close_voting declares `vote_passed` (trivially satisfied while v1 rounds
 *     carry no quorum/threshold rules — recorded, not yet deciding);
 *   - `complete` is reachable from every non-terminal state because funding
 *     can hit 100% at any stage today (recalculateProgress), system-driven.
 * v1 changes no behavior by construction — the W4 parity spec verifies it.
 *
 * All other definitions ship AUTHORED BUT INACTIVE (isActive=false);
 * activation belongs to Waves 5/6 with their owners.
 */

type StateSeed = { key: string; kind?: 'initial' | 'normal' | 'terminal' };
type TransitionSeed = {
  from: string;
  to: string;
  action: string;
  guards?: unknown[];
  effects?: string[];
};
type DefinitionSeed = {
  key: string;
  version: number;
  subjectType: string;
  isActive: boolean;
  description: string;
  states: StateSeed[];
  transitions: TransitionSeed[];
};

const GOV_ROLE = {
  type: 'role',
  anyOf: [{ scope: 'platform', roles: ['board_chair', 'board_member'] }],
};
const ORG_OR_BOARD_ROLE = {
  type: 'role',
  anyOf: [
    { scope: 'organization', roles: ['org_admin', 'project_manager', 'staff'] },
    { scope: 'platform', roles: ['board_chair', 'board_member'] },
  ],
};

export const WORKFLOW_DEFINITIONS: DefinitionSeed[] = [
  {
    key: 'project-lifecycle',
    version: 1,
    subjectType: 'project',
    isActive: true,
    description:
      'Exact transcription of the legacy StudyStatus machine + donation/execution/closure stages (W4-E2-S1). Parity-verified; changes no behavior.',
    states: [
      { key: 'draft', kind: 'initial' },
      { key: 'in_review' },
      { key: 'published' },
      { key: 'voting_open' },
      { key: 'voting_closed' },
      { key: 'approved' },
      { key: 'rejected', kind: 'terminal' },
      { key: 'donations_open' },
      { key: 'executing' },
      { key: 'completed', kind: 'terminal' },
    ],
    transitions: [
      { from: 'draft', to: 'in_review', action: 'submit', guards: [ORG_OR_BOARD_ROLE] },
      { from: 'in_review', to: 'draft', action: 'revise', guards: [ORG_OR_BOARD_ROLE] },
      { from: 'in_review', to: 'published', action: 'publish', guards: [GOV_ROLE], effects: ['study.published'] },
      {
        from: 'in_review',
        to: 'draft',
        action: 'request_changes',
        guards: [GOV_ROLE, { type: 'board_decision', decision: 'changes_requested' }],
      },
      {
        from: 'published',
        to: 'voting_open',
        action: 'open_voting',
        guards: [GOV_ROLE],
        effects: ['vote_round.create', 'voting.opened'],
      },
      { from: 'voting_open', to: 'voting_open', action: 'extend_voting', guards: [GOV_ROLE] },
      {
        from: 'voting_open',
        to: 'voting_closed',
        action: 'close_voting',
        // vote_passed is declared per 04 — with v1 rounds carrying no
        // quorum/threshold rules it records the tally without deciding
        guards: [GOV_ROLE, { type: 'vote_passed' }],
        effects: ['vote_round.close', 'voting.closed'],
      },
      {
        from: 'voting_closed',
        to: 'approved',
        action: 'approve',
        guards: [GOV_ROLE, { type: 'board_decision', decision: 'approved' }],
        effects: ['study.approved'],
      },
      {
        from: 'voting_closed',
        to: 'rejected',
        action: 'reject',
        guards: [GOV_ROLE, { type: 'board_decision', decision: 'rejected' }],
        effects: ['study.rejected'],
      },
      { from: 'voting_closed', to: 'in_review', action: 'reopen_review', guards: [GOV_ROLE] },
      {
        from: 'voting_closed',
        to: 'draft',
        action: 'request_changes',
        guards: [GOV_ROLE, { type: 'board_decision', decision: 'changes_requested' }],
      },
      // Post-approval stages: donations were never study-gated in the legacy
      // system, so open_donations follows approval unguarded (capability
      // gating arrives with v2), and completion is funding-driven from any
      // non-terminal state (system actor).
      { from: 'approved', to: 'donations_open', action: 'open_donations' },
      { from: 'donations_open', to: 'executing', action: 'begin_execution', guards: [ORG_OR_BOARD_ROLE] },
      ...['draft', 'in_review', 'published', 'voting_open', 'voting_closed', 'approved', 'donations_open', 'executing'].map(
        (from) => ({ from, to: 'completed', action: 'complete', effects: [] as string[] }),
      ),
    ],
  },

  // ─── Authored, inactive (W4-E6-S1) ─────────────────────────────────────────
  {
    key: 'project-lifecycle',
    version: 2,
    subjectType: 'project',
    isActive: false,
    description:
      'v2 (INACTIVE — Wave 5/6 activation): board_review between voting_closed and approved; executing-org capability guard on execution.',
    states: [
      { key: 'draft', kind: 'initial' },
      { key: 'in_review' },
      { key: 'published' },
      { key: 'voting_open' },
      { key: 'voting_closed' },
      { key: 'board_review' },
      { key: 'approved' },
      { key: 'rejected', kind: 'terminal' },
      { key: 'donations_open' },
      { key: 'executing' },
      { key: 'completed', kind: 'terminal' },
    ],
    transitions: [
      { from: 'draft', to: 'in_review', action: 'submit', guards: [ORG_OR_BOARD_ROLE, { type: 'sections_complete' }] },
      { from: 'in_review', to: 'draft', action: 'revise', guards: [ORG_OR_BOARD_ROLE] },
      { from: 'in_review', to: 'published', action: 'publish', guards: [GOV_ROLE] , effects: ['study.published'] },
      { from: 'published', to: 'voting_open', action: 'open_voting', guards: [GOV_ROLE], effects: ['vote_round.create', 'voting.opened'] },
      { from: 'voting_open', to: 'voting_closed', action: 'close_voting', guards: [GOV_ROLE, { type: 'vote_passed' }, { type: 'window_open', field: 'voting', mustBeClosed: true }], effects: ['vote_round.close', 'voting.closed'] },
      { from: 'voting_closed', to: 'board_review', action: 'send_to_board', guards: [GOV_ROLE] },
      { from: 'board_review', to: 'approved', action: 'approve', guards: [GOV_ROLE, { type: 'board_decision', decision: 'approved' }], effects: ['study.approved'] },
      { from: 'board_review', to: 'rejected', action: 'reject', guards: [GOV_ROLE, { type: 'board_decision', decision: 'rejected' }], effects: ['study.rejected'] },
      { from: 'board_review', to: 'draft', action: 'request_changes', guards: [GOV_ROLE, { type: 'board_decision', decision: 'changes_requested' }] },
      { from: 'approved', to: 'donations_open', action: 'open_donations', guards: [{ type: 'capability', cap: 'canOpenDonations' }] },
      { from: 'donations_open', to: 'executing', action: 'begin_execution', guards: [ORG_OR_BOARD_ROLE, { type: 'capability', cap: 'canExecuteProjects' }] },
      { from: 'executing', to: 'completed', action: 'complete' },
      { from: 'donations_open', to: 'completed', action: 'complete' },
    ],
  },
  {
    key: 'emergency-relief',
    version: 1,
    subjectType: 'project',
    isActive: false,
    description: 'INACTIVE (Wave 5/6): no public voting — Board fast-track decision, straight to execution.',
    states: [
      { key: 'draft', kind: 'initial' },
      { key: 'board_review' },
      { key: 'approved' },
      { key: 'rejected', kind: 'terminal' },
      { key: 'executing' },
      { key: 'completed', kind: 'terminal' },
    ],
    transitions: [
      { from: 'draft', to: 'board_review', action: 'submit', guards: [ORG_OR_BOARD_ROLE] },
      { from: 'board_review', to: 'approved', action: 'approve', guards: [GOV_ROLE, { type: 'board_decision', decision: 'approved' }] },
      { from: 'board_review', to: 'rejected', action: 'reject', guards: [GOV_ROLE, { type: 'board_decision', decision: 'rejected' }] },
      { from: 'approved', to: 'executing', action: 'begin_execution', guards: [{ type: 'capability', cap: 'canExecuteProjects' }] },
      { from: 'executing', to: 'completed', action: 'complete' },
    ],
  },
  {
    key: 'org-verification',
    version: 1,
    subjectType: 'organization',
    isActive: false,
    description: 'INACTIVE (Wave 6): submitted → under_review → verified → active, Board approval guard; or rejected.',
    states: [
      { key: 'submitted', kind: 'initial' },
      { key: 'under_review' },
      { key: 'verified' },
      { key: 'active', kind: 'terminal' },
      { key: 'rejected', kind: 'terminal' },
    ],
    transitions: [
      { from: 'submitted', to: 'under_review', action: 'begin_review', guards: [GOV_ROLE] },
      { from: 'under_review', to: 'verified', action: 'verify', guards: [GOV_ROLE, { type: 'board_decision', decision: 'approved' }] },
      { from: 'under_review', to: 'rejected', action: 'reject', guards: [GOV_ROLE, { type: 'board_decision', decision: 'rejected' }] },
      { from: 'verified', to: 'active', action: 'activate', guards: [GOV_ROLE] },
    ],
  },
  {
    key: 'fund-allocation',
    version: 1,
    subjectType: 'fund_allocation',
    isActive: true, // ACTIVATED in Wave 5 (W5-E6-S1)
    description:
      'Fund→project allocation (W5): proposed → board_approved (BoardDecision guard — the launch ceiling makes it mandatory for every allocation) → disbursing → reconciled → closed.',
    states: [
      { key: 'proposed', kind: 'initial' },
      { key: 'board_approved' },
      { key: 'disbursing' },
      { key: 'reconciled' },
      { key: 'closed', kind: 'terminal' },
      { key: 'rejected', kind: 'terminal' },
    ],
    transitions: [
      { from: 'proposed', to: 'board_approved', action: 'approve', guards: [GOV_ROLE, { type: 'board_decision', decision: 'approved' }] },
      { from: 'proposed', to: 'rejected', action: 'reject', guards: [GOV_ROLE, { type: 'board_decision', decision: 'rejected' }] },
      {
        from: 'board_approved',
        to: 'disbursing',
        action: 'begin_disbursement',
        guards: [{ type: 'role', anyOf: [{ scope: 'fund', roles: ['fund_director', 'fund_deputy'] }, { scope: 'platform', roles: ['board_chair'] }] }],
      },
      {
        from: 'disbursing',
        to: 'reconciled',
        action: 'reconcile',
        guards: [{ type: 'role', anyOf: [{ scope: 'fund', roles: ['fund_director', 'fund_deputy', 'fund_accountant'] }, { scope: 'platform', roles: ['board_chair'] }] }],
      },
      {
        from: 'reconciled',
        to: 'closed',
        action: 'close',
        guards: [{ type: 'role', anyOf: [{ scope: 'fund', roles: ['fund_director'] }, { scope: 'platform', roles: ['board_chair'] }] }],
      },
    ],
  },
];

/** Idempotent: upserts definitions and replaces states/transitions to match the seed. */
export async function seedWorkflowDefinitions(prisma: PrismaClient): Promise<{ seeded: number }> {
  let seeded = 0;
  for (const def of WORKFLOW_DEFINITIONS) {
    const definition = await prisma.workflowDefinition.upsert({
      where: { key_version: { key: def.key, version: def.version } },
      create: {
        key: def.key,
        version: def.version,
        subjectType: def.subjectType,
        isActive: def.isActive,
        description: def.description,
      },
      update: { subjectType: def.subjectType, description: def.description },
    });

    // states/transitions are replaced wholesale ONLY while no instance pins
    // this definition — after that the definition is frozen (09 discipline)
    const pinned = await prisma.workflowInstance.count({ where: { definitionId: definition.id } });
    if (pinned === 0) {
      await prisma.workflowTransition.deleteMany({ where: { definitionId: definition.id } });
      await prisma.workflowState.deleteMany({ where: { definitionId: definition.id } });
      await prisma.workflowState.createMany({
        data: def.states.map((s) => ({
          definitionId: definition.id,
          key: s.key,
          kind: s.kind ?? 'normal',
        })),
      });
      await prisma.workflowTransition.createMany({
        data: def.transitions.map((t) => ({
          definitionId: definition.id,
          fromStateKey: t.from,
          toStateKey: t.to,
          actionKey: t.action,
          guards: (t.guards ?? []) as Prisma.InputJsonValue,
          effects: (t.effects ?? []) as Prisma.InputJsonValue,
        })),
      });
    }
    seeded += 1;
  }
  return { seeded };
}
