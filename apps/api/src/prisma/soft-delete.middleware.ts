import { Prisma } from '@prisma/client';
import { actorContextStorage } from '../events/actor-context.storage';

/**
 * W0-E4-S2 — central soft-delete behavior for all domain models.
 *
 * Gated by SOFT_DELETE_ENFORCED (read lazily per query, so the flag can ship
 * dark and be flipped without redeploys/restarts of tests):
 *  - delete/deleteMany   → update/updateMany { deletedAt, deletedBy }
 *  - findUnique/findFirst/findMany/count/aggregate/groupBy
 *                        → where.deletedAt = null (findUnique becomes
 *                          findFirst so the extra filter is legal)
 *  - escape hatch        → pass `includeDeleted: true` in the query args
 *                          (audit/admin use only; the key is stripped).
 *
 * Boundaries (documented, covered by the W0-E4-S4 canary spec):
 *  - Nested relation reads (include/select) are NOT filtered — top-level
 *    queries of every list/detail endpoint go through this middleware.
 *  - update/updateMany are not intercepted: services resolve entities via
 *    reads first, which already exclude soft-deleted rows.
 *
 * Raw-query grep-audit (AC): `grep -rn "queryRaw\|executeRaw" apps/api/src`
 * → zero raw SQL in production code (only jest test utilities), so no raw
 * query can bypass this middleware today. Re-run the grep when adding raw SQL.
 */

export const SOFT_DELETE_MODELS = new Set<string>([
  'Block',
  'Project',
  'ProjectDonation',
  'ProjectStudy',
  'StudySection',
  'ProjectStep',
  'ProjectPhase',
  'ProjectTask',
  'ProjectBudget',
  'ProjectExpense',
  'ProjectMilestone',
  'User',
  'Admin',
  'Participant',
  'Organization',
  'OrganizationMembership',
  'RoleAssignment',
]);

export function softDeleteEnforced(): boolean {
  return process.env.SOFT_DELETE_ENFORCED === 'true';
}

const READ_ACTIONS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);

export function createSoftDeleteMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) return next(params);

    const args = (params.args ?? {}) as Record<string, any>;
    const includeDeleted = args.includeDeleted === true;
    if ('includeDeleted' in args) delete args.includeDeleted;
    params.args = args;

    if (!softDeleteEnforced()) return next(params);

    // Deletes become updates stamping who deleted and when
    if (params.action === 'delete' || params.action === 'deleteMany') {
      const deletedBy = actorContextStorage.getStore()?.actor.userId ?? null;
      const stamp = { deletedAt: new Date(), deletedBy };

      if (params.action === 'delete') {
        params.action = 'update';
        params.args = { ...args, data: stamp };
      } else {
        params.action = 'updateMany';
        params.args = { ...args, data: stamp };
      }
      return next(params);
    }

    // Reads exclude soft-deleted rows unless explicitly asked not to
    if (READ_ACTIONS.has(params.action) && !includeDeleted) {
      if (params.action === 'findUnique') params.action = 'findFirst';
      if (params.action === 'findUniqueOrThrow') params.action = 'findFirstOrThrow';
      params.args = { ...args, where: { ...(args.where ?? {}), deletedAt: null } };
    }

    return next(params);
  };
}
