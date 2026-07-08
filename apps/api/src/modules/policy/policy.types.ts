import { RoleScopeType } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';

export interface PolicyResource {
  type?: string;
  id?: number | string;
  /** Set when the resource lives under a project (scope chain: project → org → platform). */
  projectId?: number;
  /** Set when the resource is (or is under) an organization. */
  organizationId?: number;
}

export interface GrantRequirement {
  scopeType: RoleScopeType;
  roles: readonly string[];
}

/**
 * One registry entry. Semantics: allow if ANY grant requirement matches OR
 * ANY listed condition passes (mirrors the OR semantics of legacy @Roles),
 * unless `allConditions` names conditions that must ALL hold in addition.
 */
export interface PolicyEntry {
  anyGrants?: GrantRequirement[];
  anyConditions?: string[];
  allConditions?: string[];
  /** Financial/governance action classes: decisions audited incl. denials (W1-E4-S4). */
  sensitive?: boolean;
  /** True for routes without @Roles — any authenticated actor. */
  authenticatedOnly?: boolean;
}

export interface PolicyDecision {
  allow: boolean;
  action: string;
  reason: string;
}

export type PolicyActor = Pick<ActorContext, 'userId' | 'referenceType' | 'requestId' | 'ip'>;
