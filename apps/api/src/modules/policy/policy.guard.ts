import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';

/** W2-E4-S1: when true, PolicyGuard enforces and RolesGuard goes dormant. */
export function policyEnforced(): boolean {
  return process.env.POLICY_ENFORCED === 'true';
}
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
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
    private prisma: PrismaService,
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

    // ── Enforce mode (W2-E4-S1): PolicyGuard blocks, shadow logging retired ──
    if (policyEnforced()) {
      const decision = await this.policyService.can(
        request.actorContext ?? { userId: user.sub, referenceType: user.referenceType, requestId: 'n/a', ip: null },
        action,
        await this.resourceFrom(request),
        requiredRoles ?? [],
      );
      if (this.policyService.isSensitive(action)) {
        this.eventBus.publish({
          event: 'policy.decided',
          actor: request.actorContext ?? systemActor(),
          subject: { type: 'policy_decision', id: action },
          data: { action, route, allow: decision.allow, reason: decision.reason, enforced: true },
        });
      }
      if (!decision.allow) {
        throw new ForbiddenException('You do not have permission to access this resource');
      }
      return true;
    }

    // ── Shadow mode (W1-E4-S2) ────────────────────────────────────────────────
    try {
      const legacyAllowed =
        !requiredRoles || requiredRoles.length === 0
          ? true
          : requiredRoles.some((role) => user.role === role);

      const decision = await this.policyService.can(
        request.actorContext ?? { userId: user.sub, referenceType: user.referenceType, requestId: 'n/a', ip: null },
        action,
        await this.resourceFrom(request),
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

  private async resourceFrom(request: any): Promise<PolicyResource> {
    const params = request.params ?? {};
    const path: string = request.route?.path ?? '';
    const resource: PolicyResource = {};

    if (params.projectId) resource.projectId = Number(params.projectId);
    else if (path.startsWith('/api/v1/projects/') && params.id) resource.projectId = Number(params.id);

    if (path.startsWith('/api/v1/organizations/') && params.id) {
      resource.organizationId = Number(params.id);
    }
    // W5: fund routes scope fund-role grants to the fund in the path
    if (path.startsWith('/api/v1/funds/') && params.id) {
      (resource as { id?: number }).id = Number(params.id);
    }

    // W8 fix: fund sub-resources addressed by their OWN id — allocationId
    // (`/funds/allocations/:allocationId/approve`), donationId
    // (`/funds/donations/:donationId/approve`), or the expense id on the
    // top-level `/expenses/:id` resource — previously left `resource.id`
    // unresolved for the first two, so `matchGrant`'s fund-scope branch
    // (`grant.scopeId == null || resource.id == null || ...`) treated a
    // fund-scope grant on ANY fund as a match: a fund_director of fund A
    // could approve/disburse/reconcile allocations that belong to fund B.
    // Resolve each back to its owning fund so the grant must actually match.
    if (params.allocationId) {
      const allocation = await this.prisma.fundAllocation.findUnique({
        where: { id: Number(params.allocationId) },
        select: { fundId: true, projectId: true },
      });
      if (allocation) {
        (resource as { id?: number }).id = allocation.fundId;
        resource.projectId = allocation.projectId;
      }
    }
    if (params.donationId) {
      const donation = await this.prisma.fundDonation.findUnique({
        where: { id: Number(params.donationId) },
        select: { fundId: true },
      });
      if (donation) (resource as { id?: number }).id = donation.fundId;
    }
    if (path.startsWith('/api/v1/expenses/') && params.id) {
      const expense = await this.prisma.expense.findUnique({
        where: { id: Number(params.id) },
        select: { fundId: true, projectId: true },
      });
      if (expense) {
        (resource as { id?: number }).id = expense.fundId;
        resource.projectId = expense.projectId;
      }
    }

    return resource;
  }
}
