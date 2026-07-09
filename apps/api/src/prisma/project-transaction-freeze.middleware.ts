import { Prisma } from '@prisma/client';
import { legacyJournalWriteAllowed } from './legacy-journal';

// Creates/updates frozen; deletes stay possible (aggregate deletes, W8 drop).
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);

/**
 * W5-E4-S3 — `ProjectTransaction` is FROZEN: money facts live in the ledger
 * since the Wave 5 cutover. The treasury module appends legacy rows through
 * `allowLegacyJournalWrite` (dual-write bridge); any other write is a bug.
 */
export function createProjectTransactionFreezeMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (
      params.model === 'ProjectTransaction' &&
      WRITE_ACTIONS.has(params.action) &&
      !legacyJournalWriteAllowed()
    ) {
      throw new Error(
        `ProjectTransaction is frozen (W5-E4-S3): attempted "${params.action}" — post through TreasuryService instead`,
      );
    }
    return next(params);
  };
}
