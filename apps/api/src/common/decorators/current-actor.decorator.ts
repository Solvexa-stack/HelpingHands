import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorContext } from '../../events/actor-context';

/**
 * Injects the request's ActorContext (built by ActorContextInterceptor) into
 * a controller handler, for threading into service methods:
 *
 *   create(@Body() dto: CreateProjectDto, @CurrentActor() actor: ActorContext) {
 *     return this.projectsService.create(actor, dto);
 *   }
 */
export const CurrentActor = createParamDecorator(
  (data: undefined, ctx: ExecutionContext): ActorContext | undefined => {
    return ctx.switchToHttp().getRequest().actorContext;
  },
);
