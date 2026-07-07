import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { DATABASE_PACKAGE_DIR } from '../test-env';

/**
 * Fully resets the test database to pristine seed state: truncates every
 * table (identities restarted so seeded IDs stay stable) and re-runs the
 * canonical seed. Call from each suite's beforeAll so no suite depends on
 * what a previous suite did.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  execSync('pnpm run db:seed', {
    cwd: DATABASE_PACKAGE_DIR,
    env: { ...process.env },
    stdio: 'pipe',
  });
}
