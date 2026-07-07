import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { ActorContext, systemActor } from './actor-context';

/**
 * Per-request storage for the ActorContext (W0-E2-S2).
 *
 * The store object is created by requestContextMiddleware before guards run
 * and MUTATED in place by ActorContextInterceptor once the JWT user is known
 * — mutation (not a nested run()) so the enriched actor is visible to
 * everything sharing the request's async context.
 */
export interface RequestContextStore {
  actor: ActorContext;
}

export const actorContextStorage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Injectable access to the current actor from anywhere (singleton — does not
 * introduce request-scoped DI). Prefer explicit threading (actor as the
 * first argument of mutating service methods); use this for cross-cutting
 * code such as logging or event subscribers.
 */
@Injectable()
export class ActorContextService {
  /** The current request's actor, or undefined outside a request. */
  current(): ActorContext | undefined {
    return actorContextStorage.getStore()?.actor;
  }

  /** The current actor, or a fresh system actor outside a request (cron, queues). */
  currentOrSystem(): ActorContext {
    return this.current() ?? systemActor();
  }
}
