import { randomUUID } from 'crypto';

/**
 * Who performed an action. Threaded as the first argument into mutating
 * service methods (convention enforced from W0-E2-S5 on) and stamped on
 * every domain event envelope.
 *
 * Wave 1 extends this with `activeOrgId` — add fields, never repurpose them.
 */
export interface ActorContext {
  /** User.id of the acting user; null for system actors (cron, webhooks). */
  userId: number | null;
  /** 'admin' | 'participant' from the JWT, or 'system' for non-request actors. */
  referenceType: string;
  /** Correlation id, one per request (or per system job run). */
  requestId: string;
  ip: string | null;
}

/** Actor for work not triggered by an authenticated request (cron, webhooks, seeds). */
export function systemActor(requestId?: string): ActorContext {
  return {
    userId: null,
    referenceType: 'system',
    requestId: requestId ?? randomUUID(),
    ip: null,
  };
}
