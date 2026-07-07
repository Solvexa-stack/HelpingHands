import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { anonymousActor } from './actor-context';
import { actorContextStorage } from './actor-context.storage';

/**
 * Establishes the request context (W0-E2-S2): resolves the requestId (inbound
 * X-Request-Id honored, capped; otherwise generated), echoes it on the
 * response, and opens the AsyncLocalStorage scope the rest of the request
 * pipeline — guards, interceptors, handlers — runs inside.
 *
 * Runs BEFORE guards, so the actor starts anonymous;
 * ActorContextInterceptor enriches it once the JWT is validated.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers['x-request-id'];
  const requestId =
    (typeof inbound === 'string' && inbound.trim().slice(0, 128)) || randomUUID();

  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const store = { actor: anonymousActor(requestId, req.ip ?? null) };
  actorContextStorage.run(store, () => next());
}
