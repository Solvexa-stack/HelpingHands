import { Injectable } from '@nestjs/common';
import { RoleAssignment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LEGACY_ROLE_GRANTS } from './role-catalog';
import { POLICY_REGISTRY } from './policy-registry';
import {
  GrantRequirement,
  PolicyActor,
  PolicyDecision,
  PolicyEntry,
  PolicyResource,
} from './policy.types';

/**
 * W1-E4-S1 — the authorization brain: `can(actor, action, resource)` →
 * allow | deny with a reason. Resolves grants along the resource scope chain
 * (project → owning organization → platform) and evaluates named attribute
 * conditions. Shadow-only in Wave 1 (PolicyGuard never blocks).
 */
@Injectable()
export class PolicyService {
  constructor(private prisma: PrismaService) {}

  /** Named ABAC condition handlers. `name` or `name:arg`. */
  private readonly conditionHandlers: Record<
    string,
    (arg: string | undefined, actor: PolicyActor, resource: PolicyResource, orgId: number | null) => Promise<boolean> | boolean
  > = {
    is_participant: (_arg, actor) => actor.referenceType === 'participant',
    org_has_capability: async (arg, _actor, _resource, orgId) => {
      if (!arg || orgId == null) return false;
      const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
      const capabilities = (org?.capabilities ?? {}) as Record<string, unknown>;
      return capabilities[arg] === true;
    },
  };

  async can(
    actor: PolicyActor | null | undefined,
    action: string,
    resource: PolicyResource = {},
    legacyRoles?: string[],
  ): Promise<PolicyDecision> {
    if (!actor || actor.userId == null) {
      return { allow: false, action, reason: 'denied:unauthenticated' };
    }

    const entry = POLICY_REGISTRY[action] ?? this.translateLegacy(legacyRoles);
    if (!entry) {
      return { allow: false, action, reason: 'denied:unknown-action' };
    }
    if (entry.authenticatedOnly) {
      return { allow: true, action, reason: 'granted:authenticated' };
    }

    const orgId = await this.resolveOrganizationId(resource);

    // allConditions gate everything else
    for (const condition of entry.allConditions ?? []) {
      if (!(await this.evaluateCondition(condition, actor, resource, orgId))) {
        return { allow: false, action, reason: `denied:condition:${condition}` };
      }
    }

    // OR across grant requirements…
    if (entry.anyGrants?.length) {
      const grants = await this.grantsOf(actor.userId);
      for (const requirement of entry.anyGrants) {
        const match = this.matchGrant(grants, requirement, resource, orgId);
        if (match) {
          return {
            allow: true,
            action,
            reason: `granted:${match.role}@${match.scopeType}${match.scopeId ? `:${match.scopeId}` : ''}`,
          };
        }
      }
    }

    // …and OR across conditions
    for (const condition of entry.anyConditions ?? []) {
      if (await this.evaluateCondition(condition, actor, resource, orgId)) {
        return { allow: true, action, reason: `granted:condition:${condition}` };
      }
    }

    return { allow: false, action, reason: 'denied:no-matching-grant' };
  }

  isSensitive(action: string): boolean {
    return POLICY_REGISTRY[action]?.sensitive === true;
  }

  /** Legacy `@Roles(...)` list → equivalent policy entry (shadow-mode bridge). */
  private translateLegacy(legacyRoles?: string[]): PolicyEntry | null {
    if (!legacyRoles) return null;
    if (legacyRoles.length === 0) return { authenticatedOnly: true };

    const entry: PolicyEntry = { anyGrants: [], anyConditions: [] };
    const byScope = new Map<string, Set<string>>();
    for (const legacy of legacyRoles) {
      if (legacy === 'participant') {
        entry.anyConditions!.push('is_participant');
        continue;
      }
      for (const grant of LEGACY_ROLE_GRANTS[legacy] ?? []) {
        if (!byScope.has(grant.scopeType)) byScope.set(grant.scopeType, new Set());
        byScope.get(grant.scopeType)!.add(grant.role);
      }
    }
    for (const [scopeType, roles] of byScope) {
      entry.anyGrants!.push({ scopeType: scopeType as any, roles: [...roles] });
    }
    return entry;
  }

  /** project → owning organization; direct organizationId wins. */
  private async resolveOrganizationId(resource: PolicyResource): Promise<number | null> {
    if (resource.organizationId != null) return resource.organizationId;
    if (resource.projectId != null) {
      const project = await this.prisma.project.findUnique({
        where: { id: resource.projectId },
        select: { ownerOrganizationId: true },
      });
      return project?.ownerOrganizationId ?? null;
    }
    return null;
  }

  private matchGrant(
    grants: RoleAssignment[],
    requirement: GrantRequirement,
    resource: PolicyResource,
    orgId: number | null,
  ): RoleAssignment | undefined {
    return grants.find((grant) => {
      if (grant.scopeType !== requirement.scopeType) return false;
      if (!requirement.roles.includes(grant.role)) return false;
      // Scope-id discipline: platform grants are global; scoped grants must
      // match the resolved resource scope when the resource declares one.
      if (grant.scopeType === 'platform') return true;
      if (grant.scopeType === 'organization') {
        return orgId == null || grant.scopeId === orgId;
      }
      if (grant.scopeType === 'project') {
        return resource.projectId == null || grant.scopeId === resource.projectId;
      }
      return grant.scopeId == null || grant.scopeId === resource.id;
    });
  }

  private async evaluateCondition(
    condition: string,
    actor: PolicyActor,
    resource: PolicyResource,
    orgId: number | null,
  ): Promise<boolean> {
    const [name, arg] = condition.split(':');
    const handler = this.conditionHandlers[name];
    if (!handler) return false;
    return handler(arg, actor, resource, orgId);
  }

  private async grantsOf(userId: number): Promise<RoleAssignment[]> {
    return this.prisma.roleAssignment.findMany({ where: { userId } });
  }
}
