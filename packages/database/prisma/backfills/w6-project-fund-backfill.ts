import { PrismaClient } from '@prisma/client';

/**
 * W6 addendum — "fund of record" backfill (idempotent, re-runnable).
 *
 * Project.primaryFundId is an identity field (like ownerOrganizationId), not
 * a financing one — FundAllocation stays many-to-many for actual co-funding
 * (03_DATA_MODEL.md:90). This backfill only derives what is unambiguous:
 * a project whose FundAllocation rows name exactly one distinct fund gets
 * that fund as its primaryFundId. Zero or multiple distinct funds cannot be
 * guessed (09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md — data safety rules)
 * and are reported for manual Board/finance reconciliation instead.
 */

export interface ProjectFundBackfillResult {
  projectsChecked: number;
  assigned: number;
  needsReview: number;
  reviewProjectIds: number[];
}

export async function backfillProjectFund(prisma: PrismaClient): Promise<ProjectFundBackfillResult> {
  const candidates = await prisma.project.findMany({
    where: { primaryFundId: null },
    select: {
      id: true,
      allocations: { select: { fundId: true }, distinct: ['fundId'] },
    },
  });

  let assigned = 0;
  const reviewProjectIds: number[] = [];

  for (const project of candidates) {
    const distinctFundIds = [...new Set(project.allocations.map((a) => a.fundId))];
    if (distinctFundIds.length === 1) {
      await prisma.project.update({
        where: { id: project.id },
        data: { primaryFundId: distinctFundIds[0] },
      });
      assigned += 1;
    } else {
      reviewProjectIds.push(project.id);
    }
  }

  return {
    projectsChecked: candidates.length,
    assigned,
    needsReview: reviewProjectIds.length,
    reviewProjectIds,
  };
}
