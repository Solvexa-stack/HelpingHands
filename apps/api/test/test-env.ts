import { join } from 'path';

/**
 * Single source of truth for the e2e environment. Imported both by the jest
 * setupFiles hook (test process) and by global-setup.ts (separate process),
 * so every process agrees on the test database URL and JWT secrets.
 *
 * The harness NEVER touches the dev database: it always points at a
 * dedicated test database (default `helping_hands_test`), overridable via
 * TEST_DATABASE_URL.
 */

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:password@localhost:5432/helping_hands_test?schema=public';

export const DATABASE_PACKAGE_DIR = join(__dirname, '..', '..', '..', 'packages', 'database');

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

  // Deterministic secrets so token factories and the app always agree,
  // regardless of any local .env files.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-test-refresh-secret';

  // Stripe test keys: the secret key must not be the "sk_test_placeholder"
  // sentinel or StripeService disables itself. Webhook verification is pure
  // HMAC over the raw body — no network — so specs can sign their own
  // simulated events with this same webhook secret.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_e2e_dummy_key';
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_e2e_test_secret';

  // Enforcement flags: the suite's baseline is flags-OFF (Wave 1 behavior);
  // specs that exercise enforcement flip these per-suite. Pinning here keeps
  // the root .env fallback (dev convenience in app.module) out of tests.
  process.env.TENANCY_ENFORCED = process.env.TENANCY_ENFORCED || 'false';
  process.env.POLICY_ENFORCED = process.env.POLICY_ENFORCED || 'false';
}

/** URL of the server-level maintenance DB, used to CREATE the test database. */
export function maintenanceUrl(testDatabaseUrl: string): { url: string; dbName: string } {
  const url = new URL(testDatabaseUrl);
  const dbName = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';
  return { url: url.toString(), dbName };
}
