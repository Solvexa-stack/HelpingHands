import { Prisma, PrismaClient } from '@prisma/client';

/**
 * W3-E3-S1 / W3-E4 — governance backfill (idempotent, re-runnable).
 *
 * 1. One VoteRound per study that has voting history (votes or a voting
 *    window): window fields → opensAt/closesAt, status open only while the
 *    study is still voting_open; StudyVote rows copied to Vote; closed rounds
 *    get their tally recorded.
 * 2. Studies already approved/rejected before Wave 3 get a BoardDecision so
 *    the nightly decision↔legacy parity check starts clean.
 *
 * Verification (returned + asserted by callers): per-study vote counts and
 * per-choice tallies must match StudyVote exactly.
 */

const REQUEST_ID = 'w3-backfill';

export interface GovernanceBackfillResult {
  roundsCreated: number;
  votesCopied: number;
  decisionsCreated: number;
  verification: { studiesChecked: number; mismatches: string[] };
}

export async function backfillGovernance(prisma: PrismaClient): Promise<GovernanceBackfillResult> {
  let roundsCreated = 0;
  let votesCopied = 0;
  let decisionsCreated = 0;

  const studies = await prisma.projectStudy.findMany({
    include: { votes: true },
    orderBy: { id: 'asc' },
  });

  for (const study of studies) {
    const hasHistory = study.votes.length > 0 || study.votingStartsAt !== null;

    // ── Round + votes ──
    if (hasHistory) {
      let round = await prisma.voteRound.findFirst({
        where: { subjectType: 'project_study', subjectId: study.id },
        orderBy: { id: 'asc' },
      });
      if (!round) {
        const isOpen = study.status === 'voting_open';
        round = await prisma.voteRound.create({
          data: {
            subjectType: 'project_study',
            subjectId: study.id,
            status: isOpen ? 'open' : 'closed',
            opensAt: study.votingStartsAt ?? study.createdAt,
            closesAt: isOpen ? study.votingEndsAt : (study.votingEndsAt ?? study.updatedAt),
            eligibility: { type: 'authenticated' } as Prisma.InputJsonValue,
            rules: {} as Prisma.InputJsonValue,
            reminderSentAt: study.reminderSentAt,
          },
        });
        roundsCreated += 1;
      }

      for (const legacy of study.votes) {
        const created = await prisma.vote
          .create({
            data: {
              voteRoundId: round.id,
              userId: legacy.userId,
              choice: legacy.choice,
              comment: legacy.comment,
              createdAt: legacy.createdAt,
            },
          })
          .catch((err) => {
            if (err?.code === 'P2002') return null; // already copied — idempotent
            throw err;
          });
        if (created) votesCopied += 1;
      }

      // record the tally on closed rounds
      if (round.status === 'closed' && round.result === null) {
        const tally = await tallyRound(prisma, round.id);
        await prisma.voteRound.update({ where: { id: round.id }, data: { result: tally } });
      }
    }

    // ── Legacy approval/rejection → BoardDecision ──
    if (study.status === 'approved' || study.status === 'rejected') {
      const existing = await prisma.boardDecision.findFirst({
        where: { subjectType: 'project_study', subjectId: study.id, decision: study.status },
      });
      if (!existing) {
        const decidedBy =
          study.approvedByUserId ??
          (study.approvedById
            ? (
                await prisma.user.findFirst({
                  where: { referenceType: 'admin', referenceId: study.approvedById },
                })
              )?.id
            : null);
        const fallbackChair = await prisma.roleAssignment.findFirst({
          where: { scopeType: 'platform', role: 'board_chair' },
          orderBy: { id: 'asc' },
        });
        const decidedById = decidedBy ?? fallbackChair?.userId;
        if (decidedById != null) {
          const round = await prisma.voteRound.findFirst({
            where: { subjectType: 'project_study', subjectId: study.id },
            orderBy: { id: 'asc' },
          });
          await prisma.boardDecision.create({
            data: {
              subjectType: 'project_study',
              subjectId: study.id,
              decision: study.status,
              rationale:
                study.status === 'rejected' && study.rejectionReason
                  ? study.rejectionReason
                  : 'Backfilled from legacy approval (pre-governance, W3 migration)',
              decidedById,
              decidedAt: study.approvedAt ?? study.updatedAt,
              voteRoundId: round?.id ?? null,
            },
          });
          decisionsCreated += 1;
          await prisma.auditLog
            .create({
              data: {
                actorUserId: null,
                action: 'board_decision.backfilled',
                subjectType: 'project_study',
                subjectId: String(study.id),
                after: { decision: study.status } as Prisma.InputJsonValue,
                requestId: REQUEST_ID,
              },
            })
            .catch(() => null);
        }
      }
    }
  }

  return { roundsCreated, votesCopied, decisionsCreated, verification: await verifyGovernanceBackfill(prisma) };
}

async function tallyRound(prisma: PrismaClient, roundId: number): Promise<Prisma.InputJsonValue> {
  const groups = await prisma.vote.groupBy({
    by: ['choice'],
    where: { voteRoundId: roundId },
    _count: { choice: true },
  });
  const tally = { for: 0, against: 0, abstain: 0, total: 0, passed: null as boolean | null };
  for (const g of groups) {
    tally[g.choice as 'for' | 'against' | 'abstain'] = g._count.choice;
    tally.total += g._count.choice;
  }
  return tally as unknown as Prisma.InputJsonValue;
}

/** Per-study vote counts and per-choice tallies must match StudyVote exactly. */
export async function verifyGovernanceBackfill(
  prisma: PrismaClient,
): Promise<{ studiesChecked: number; mismatches: string[] }> {
  const mismatches: string[] = [];
  const studies = await prisma.projectStudy.findMany({ select: { id: true } });

  for (const { id } of studies) {
    const legacy = await prisma.studyVote.groupBy({
      by: ['choice'],
      where: { studyId: id },
      _count: { choice: true },
    });
    if (legacy.length === 0) continue;

    const round = await prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: id },
      orderBy: { id: 'asc' },
    });
    if (!round) {
      mismatches.push(`study ${id}: has legacy votes but no round`);
      continue;
    }
    const migrated = await prisma.vote.groupBy({
      by: ['choice'],
      where: { voteRoundId: round.id },
      _count: { choice: true },
    });
    for (const l of legacy) {
      const m = migrated.find((x) => x.choice === l.choice);
      if ((m?._count.choice ?? 0) !== l._count.choice) {
        mismatches.push(
          `study ${id}: choice ${l.choice} legacy=${l._count.choice} migrated=${m?._count.choice ?? 0}`,
        );
      }
    }
  }
  return { studiesChecked: studies.length, mismatches };
}
