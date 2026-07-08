import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { ROUTE_ACTION_MAP } from './policy-registry';
import { PolicyService } from './policy.service';
import { PolicyResource } from './policy.types';

export const CAN_KEY = 'policy:action';
/** Explicit action annotation; most routes are covered by ROUTE_ACTION_MAP + derivation. */
export const Can = (action: string) => SetMetadata(CAN_KEY, action);

export interface PolicyDivergence {
  route: string;
  action: string;
  userId: number | null;
  legacyAllowed: boolean;
  policyAllowed: boolean;
  reason: string;
}

/** In-memory divergence sink for the W1-E4-S3 burn-down (read by tests/report). */
@Injectable()
export class PolicyDivergenceRecorder {
  readonly divergences: PolicyDivergence[] = [];

  record(divergence: PolicyDivergence) {
    this.divergences.push(divergence);
  }

  report(): Record<string, number> {
    return this.divergences.reduce<Record<string, number>>((acc, d) => {
      acc[d.route] = (acc[d.route] ?? 0) + 1;
      return acc;
    }, {});
  }
}

/**
 * W1-E4-S2 — PolicyGuard in SHADOW MODE. Registered between JwtAuthGuard and
 * RolesGuard: it sees the validated user, computes both the legacy decision
 * (same logic as RolesGuard) and the policy decision, records divergences,
 * audits sensitive-action decisions (allow AND deny, W1-E4-S4) — and always
 * returns true. RolesGuard remains the enforcer until the Wave 2 flip.
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private reflector: Reflector,
    private policyService: PolicyService,
    private recorder: PolicyDivergenceRecorder,
    private eventBus: EventBusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true; // JwtAuthGuard will reject; nothing to compare

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const route = `${request.method} ${request.route?.path ?? request.url}`;
    const action =
      this.reflector.getAllAndOverride<string>(CAN_KEY, [context.getHandler(), context.getClass()]) ??
      ROUTE_ACTION_MAP[route] ??
      `route:${route}`;

    try {
      const legacyAllowed =
        !requiredRoles || requiredRoles.length === 0
          ? true
          : requiredRoles.some((role) => user.role === role);

      const decision = await this.policyService.can(
        request.actorContext ?? { userId: user.sub, referenceType: user.referenceType, requestId: 'n/a', ip: null },
        action,
        this.resourceFrom(request),
        requiredRoles ?? [],
      );

      if (decision.allow !== legacyAllowed) {
        const divergence = {
          route,
          action,
          userId: user.sub ?? null,
          legacyAllowed,
          policyAllowed: decision.allow,
          reason: decision.reason,
        };
        this.recorder.record(divergence);
        this.logger.warn(`Policy divergence: ${JSON.stringify(divergence)}`);
      }

      if (this.policyService.isSensitive(action)) {
        this.eventBus.publish({
          event: 'policy.decided',
          actor: request.actorContext ?? systemActor(),
          subject: { type: 'policy_decision', id: action },
          data: { action, route, allow: decision.allow, reason: decision.reason, legacyAllowed },
        });
      }
    } catch (err) {
      // Shadow mode must never break a request
      this.logger.error(`PolicyGuard shadow evaluation failed for ${route}`, err instanceof Error ? err.stack : String(err));
    }

    return true;
  }

  private resourceFrom(request: any): PolicyResource {
    const params = request.params ?? {};
    const path: string = request.route?.path ?? '';
    const resource: PolicyResource = {};

    if (params.projectId) resource.projectId = Number(params.projectId);
    else if (path.startsWith('/api/v1/projects/') && params.id) resource.projectId = Number(params.id);

    if (path.startsWith('/api/v1/organizations/') && params.id) {
      resource.organizationId = Number(params.id);
    }
    return resource;
  }
}
