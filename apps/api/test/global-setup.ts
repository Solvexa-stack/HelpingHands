import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { applyTestEnv, maintenanceUrl, DATABASE_PACKAGE_DIR } from './test-env';

/**
 * Runs once per `pnpm test:e2e` invocation, in its own process:
 *  1. creates the test database if it does not exist,
 *  2. applies all migrations (`prisma migrate deploy`),
 *  3. seeds it (each suite re-truncates + re-seeds via resetDatabase()).
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const testDatabaseUrl = process.env.DATABASE_URL!;
  const { url, dbName } = maintenanceUrl(testDatabaseUrl);

  const admin = new PrismaClient({ datasources: { db: { url } } });
  try {
    const existing = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
    );
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`\n🧪 Created test database "${dbName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: testDatabaseUrl };
  console.log(`🧪 Applying migrations to "${dbName}"...`);
  execSync('pnpm exec prisma migrate deploy', { cwd: DATABASE_PACKAGE_DIR, env, stdio: 'inherit' });
  console.log(`🧪 Seeding "${dbName}"...`);
  execSync('pnpm run db:seed', { cwd: DATABASE_PACKAGE_DIR, env, stdio: 'inherit' });
}
