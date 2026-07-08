import { Injectable } from '@nestjs/common';
import { ActorContextService } from '../../events/actor-context.storage';

/**
 * W1-E5-S2 — tenancy-aware filtering, built DARK: no production route uses
 * it yet (Wave 2 flips org-scoped queries onto it). Derives the org filter
 * for org-owned aggregates from the ambient ActorContext.
 */
@Injectable()
export class TenancyRepository {
  constructor(private actorContext: ActorContextService) {}

  /** `{ ownerOrganizationId }` for the actor's active org; empty when none (platform/system). */
  orgFilter(): { ownerOrganizationId?: number } {
    const activeOrgId = this.actorContext.current()?.activeOrgId;
    return activeOrgId == null ? {} : { ownerOrganizationId: activeOrgId };
  }

  /** Merge the tenancy filter into a project where-clause. */
  scopedProjectWhere<T extends object>(where: T = {} as T): T & { ownerOrganizationId?: number } {
    return { ...where, ...this.orgFilter() };
  }
}
