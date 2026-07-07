import { applyTestEnv } from './test-env';

// Runs (via jest `setupFiles`) before any application code is imported,
// so PrismaClient and ConfigModule can only ever see the test database.
applyTestEnv();
