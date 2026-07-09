import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorContextService } from '../../events/actor-context.storage';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

export const BOARD_READ_ROLES = ['board_chair', 'board_member', 'board_secretary', 'platform_auditor'];

export function tenancyEnforced(): boolean {
  return process.env.TENANCY_ENFORCED === 'true';
}

/**
 * W1-E5-S2 (built dark) → W2-E3-S1 (enforced behind TENANCY_ENFORCED).
 * Org-owned aggregates (projects + subtree) route through here. The Board
 * platform-read bypass is a policy grant and every use is audited.
 */
@Injectable()
export class TenancyRepository {
  constructor(
    private actorContext: ActorContextService,
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /** `{ ownerOrganizationId }` for the actor's active org; empty when none (platform/system). */
  orgFilter(): { ownerOrganizationId?: number } {
    const activeOrgId = this.actorContext.current()?.activeOrgId;
    return activeOrgId == null ? {} : { ownerOrganizationId: activeOrgId };
  }

  /** Merge the tenancy filter into a project where-clause. */
  scopedProjectWhere<T extends object>(where: T = {} as T): T & { ownerOrganizationId?: number } {
    return { ...where, ...this.orgFilter() };
  }

  /**
   * W2 isolation core: the org id to enforce for the current actor, or null
   * when scoping does not apply (flag off, public/anon/system actor, or the
   * audited Board platform-read bypass).
   */
  async enforcedOrgId(auditSubject: string): Promise<number | null> {
    if (!tenancyEnforced()) return null;
    const actor = this.actorContext.current();
    if (!actor || actor.userId == null || actor.activeOrgId == null) return null; // public/anon: unchanged
    if (await this.hasBoardReadBypass(actor.userId)) {
      this.auditBypass(auditSubject);
      return null;
    }
    return actor.activeOrgId;
  }

  /** Flag-gated list filter incl. the audited Board read-bypass. */
  async enforcedProjectWhere<T extends object>(where: T = {} as T, auditSubject = 'project.list'): Promise<T> {
    const orgId = await this.enforcedOrgId(auditSubject);
    return orgId == null ? where : { ...where, ownerOrganizationId: orgId };
  }

  /**
   * Same, for entities that hang off a project relation (donations, studies,
   * online donations, …): merges `{ [relation]: { ownerOrganizationId } }`
   * into the where-clause, preserving any existing relation constraints.
   */
  async enforcedProjectRelationWhere<T extends object>(
    where: T = {} as T,
    auditSubject: string,
    relation = 'project',
  ): Promise<T> {
    const orgId = await this.enforcedOrgId(auditSubject);
    if (orgId == null) return where;
    const existing = (where as Record<string, any>)[relation] ?? {};
    return { ...where, [relation]: { ...existing, ownerOrganizationId: orgId } };
  }

  /** Flag-gated visibility assertion for a single project (subtree choke points). */
  async assertProjectVisible(projectId: number): Promise<void> {
    if (!tenancyEnforced()) return;
    const actor = this.actorContext.current();
    if (!actor || actor.userId == null || actor.activeOrgId == null) return;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerOrganizationId: true },
    });
    if (!project) return; // let the caller produce its own 404
    if (project.ownerOrganizationId === actor.activeOrgId) return;

    if (await this.hasBoardReadBypass(actor.userId)) {
      this.auditBypass(`project.read:${projectId}`);
      return;
    }
    // Cross-org access reads as nonexistence — no information leak
    throw new NotFoundException(`Project #${projectId} not found`);
  }

  private async hasBoardReadBypass(userId: number): Promise<boolean> {
    const grant = await this.prisma.roleAssignment.findFirst({
      where: { userId, scopeType: 'platform', role: { in: BOARD_READ_ROLES } },
    });
    return grant !== null;
  }

  private auditBypass(subject: string): void {
    const actor = this.actorContext.currentOrSystem();
    this.eventBus.publish({
      event: 'tenancy.bypassed',
      actor,
      subject: { type: 'tenancy_bypass', id: subject },
      data: { activeOrgId: actor.activeOrgId ?? null },
    });
  }
}
