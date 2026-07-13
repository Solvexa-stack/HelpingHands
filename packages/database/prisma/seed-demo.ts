import { PrismaClient } from '@prisma/client';
import { seedDemoData } from './seeds/demo-data';
import { backfillIdentity } from './backfills/w1-identity-backfill';
import { backfillGovernance } from './backfills/w3-governance-backfill';
import { backfillWorkflowInstances } from './backfills/w4-workflow-backfill';
import { backfillTreasury } from './backfills/w5-treasury-backfill';
import { backfillProjectFund } from './backfills/w6-project-fund-backfill';

const prisma = new PrismaClient();

/**
 * Production-safe demo data seeding. Additive and idempotent — safe to run
 * multiple times, including against a database that already has real data
 * from `seed.ts` or live usage. Never deletes or overwrites existing rows.
 *
 * Run with: pnpm --filter @helping-hands/database db:seed:demo
 * (see the file header of prisma/seeds/demo-data.ts for what it creates).
 */
async function main() {
  console.log('🌱 Seeding demo data...\n');

  const result = await seedDemoData(prisma);

  // Mirror ProjectsService.recalculateProgress for every project so
  // progression/isCompleted reflect the donations this seed (or any prior
  // run) created — same formula the app uses at donation-approval time.
  const projects = await prisma.project.findMany({ select: { id: true, value: true, isCompleted: true } });
  let progressRecalculated = 0;
  for (const project of projects) {
    const [cash, online] = await Promise.all([
      prisma.projectDonation.aggregate({ where: { projectId: project.id, status: 'approved' }, _sum: { amount: true } }),
      prisma.onlineDonation.aggregate({ where: { projectId: project.id, status: 'completed' }, _sum: { amount: true } }),
    ]);
    const collected = Number(cash._sum.amount ?? 0) + Number(online._sum.amount ?? 0);
    const value = Number(project.value);
    const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
    const isCompleted = collected >= value && value > 0;
    await prisma.project.update({ where: { id: project.id }, data: { progression, isCompleted } });
    progressRecalculated += 1;
  }
  console.log(`✅ Recalculated progress for ${progressRecalculated} projects`);

  // Re-run the same idempotent backfills the base seed uses so the new
  // legacy-shaped rows (StudyVote, Project.studyStatus/isCompleted,
  // ProjectTransaction) project correctly into governance/workflow/treasury.
  const identity = await backfillIdentity(prisma);
  console.log(`✅ Identity backfill (${identity.membershipsCreated} memberships, ${identity.grantsCreated} grants)`);

  const governance = await backfillGovernance(prisma);
  if (governance.verification.mismatches.length > 0) {
    throw new Error(`Governance backfill verification failed: ${governance.verification.mismatches.join('; ')}`);
  }
  console.log(`✅ Governance backfill (${governance.roundsCreated} rounds, ${governance.votesCopied} votes, ${governance.decisionsCreated} decisions; tallies verified)`);

  const workflow = await backfillWorkflowInstances(prisma);
  if (workflow.verification.mismatches.length > 0) {
    throw new Error(`Workflow backfill verification failed: ${workflow.verification.mismatches.join('; ')}`);
  }
  console.log(`✅ Workflow engine (${workflow.instancesCreated} instances backfilled; derivation verified)`);

  const treasury = await backfillTreasury(prisma);
  if (treasury.reconciliation.mismatches.length > 0) {
    throw new Error(`Treasury reconciliation gate failed: ${treasury.reconciliation.mismatches.join('; ')}`);
  }
  console.log(
    `✅ Treasury (${treasury.accountsCreated} accounts created; ${treasury.transactionsReconstructed} legacy rows reconstructed; reconciliation exact for ${treasury.reconciliation.projectsChecked} projects)`,
  );

  const projectFund = await backfillProjectFund(prisma);
  console.log(`✅ Fund of record (${projectFund.projectsChecked} projects checked; ${projectFund.assigned} assigned)`);

  console.log('\n📊 Demo data summary:');
  for (const [key, count] of Object.entries(result.counts)) {
    console.log(`  ${key}: ${count}`);
  }

  console.log('\n✨ Demo data seeded successfully!');
  console.log('\nNew demo accounts (all use password Demo@12345):');
  console.log('  Board Chair:          chair@helpinghands.org');
  console.log('  Board Members:        board.member1@helpinghands.org, board.member2@helpinghands.org');
  console.log('  Board Secretary:      secretary@helpinghands.org');
  console.log('  Platform Auditor:     auditor@helpinghands.org');
  console.log('  Org Admins:           admin.foundation@helpinghands.org, admin.water@helpinghands.org,');
  console.log('                        admin.education@helpinghands.org, admin.medical@helpinghands.org');
  console.log('  Project Managers:     pm.foundation@helpinghands.org, pm.water@helpinghands.org, ...');
  console.log('  Financial Officers:   finance.foundation@helpinghands.org, finance.water@helpinghands.org, ...');
  console.log('\n(Super Admin uses the existing admin@helpinghands.org / Admin@123456 from seed.ts,');
  console.log(' now additionally granted the platform "super_admin" role.)');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
