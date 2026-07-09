import { AsyncLocalStorage } from 'async_hooks';

/**
 * W5-E4-S3 — `ProjectTransaction` freeze bypass. The legacy journal is frozen
 * read-only; ONLY the treasury module's dual-write (new→old, until reader
 * cutover completes and Wave 8 drops the table) may append rows, and it does
 * so inside this scope.
 */
const als = new AsyncLocalStorage<{ allowed: boolean }>();

export function allowLegacyJournalWrite<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ allowed: true }, fn);
}

export function legacyJournalWriteAllowed(): boolean {
  return als.getStore()?.allowed === true;
}
