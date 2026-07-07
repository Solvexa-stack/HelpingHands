import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { ActorContext, anonymousActor } from './actor-context';
import { actorContextStorage } from './actor-context.storage';

/**
 * Builds the definitive ActorContext for every HTTP request (W0-E2-S2).
 *
 * Interceptors run after guards, so on authed routes `request.user` holds the
 * validated JwtPayload; on @Public routes the actor stays anonymous. The
 * result is attached to the request (for @CurrentActor) and written into the
 * AsyncLocalStorage store opened by requestContextMiddleware (for
 * ActorContextService).
 */
@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      const requestId: string = request.requestId ?? randomUUID();
      const user = request.user as JwtPayload | undefined;

      const actor: ActorContext = user
        ? {
            userId: user.sub,
            referenceType: user.referenceType,
            requestId,
            ip: request.ip ?? null,
          }
        : anonymousActor(requestId, request.ip ?? null);

      request.actorContext = actor;
      const store = actorContextStorage.getStore();
      if (store) store.actor = actor;
    }

    return next.handle();
  }
}
