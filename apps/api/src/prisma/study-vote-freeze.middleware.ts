import { Prisma } from '@prisma/client';

// Creates/updates are frozen; deletes stay possible — the draft-study
// aggregate delete must clean its legacy rows, and Wave 8 drops the table.
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);

/**
 * W3-E3-S2 — `StudyVote` is FROZEN read-only: votes live in
 * `VoteRound`/`Vote` since the Wave 3 cutover; the legacy table is kept for
 * verification until Wave 8 drops it. Any application write is a bug — fail
 * loudly. (Table resets in tests use raw TRUNCATE, which bypasses Prisma
 * middleware by design.)
 */
export function createStudyVoteFreezeMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (params.model === 'StudyVote' && WRITE_ACTIONS.has(params.action)) {
      throw new Error(
        `StudyVote is frozen (W3-E3-S2): attempted "${params.action}" — write to VoteRound/Vote via the governance/voting services instead`,
      );
    }
    return next(params);
  };
}
