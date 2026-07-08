import { PrismaClient } from '@prisma/client';
import { backfillIdentity, checkRoleParity } from './w1-identity-backfill';

const prisma = new PrismaClient();

backfillIdentity(prisma)
  .then(async (result) => {
    console.log(
      `✅ W1 identity backfill: ${result.membershipsCreated} memberships, ${result.grantsCreated} grants created`,
    );
    const drift = await checkRoleParity(prisma);
    if (drift.length > 0) {
      console.error('❌ parity drift:', JSON.stringify(drift, null, 2));
      process.exit(1);
    }
    console.log('✅ enum↔grant parity clean');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
