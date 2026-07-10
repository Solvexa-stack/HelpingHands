import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParticipationRole } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyRepository } from '../policy/tenancy.repository';

export const PROJECT_ROLES = ['project_lead', 'contributor', 'financial_delegate'];

/**
 * W6-E1-S1 / W6-E5-S1 — joint projects. ProjectParticipation records which
 * organizations take part in a project and in what role (owner |
 * executing_agency | funding_partner | supervising | beneficiary_rep);
 * project-scope grants (contributor, financial_delegate, project_lead) admit
 * individual members of participating orgs to exactly this project — the
 * cross-org execution channel (05: "there is no municipality module").
 */
@Injectable()
export class ParticipationsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
  ) {}

  async list(projectId: number) {
    await this.tenancy.assertProjectVisible(projectId);
    return this.prisma.projectParticipation.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { id: 'asc' },
      include: { organization: { select: { id: true, name: true, type: true, status: true } } },
    });
  }

  async addParticipation(
    actor: ActorContext,
    projectId: number,
    dto: { organizationId: number; role: ParticipationRole; notes?: string },
  ) {
    await this.tenancy.assertProjectVisible(projectId);
    const [project, organization] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.organization.findUnique({ where: { id: dto.organizationId } }),
    ]);
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    if (!organization) throw new NotFoundException(`Organization #${dto.organizationId} not found`);
    if (organization.status !== 'active') {
      throw new BadRequestException(`Organization is ${organization.status} — only active organizations can participate`);
    }

    // W6 addendum — at most one active "owner" participation per project.
    // Project.ownerOrganizationId remains the structural owner and is
    // unaffected by this; this only guards the parallel accountability
    // record so a joint project can never carry two (or, once ended,
    // silently zero) owner participations without it being an explicit,
    // auditable end-then-add sequence.
    if (dto.role === 'owner') {
      const existingOwner = await this.prisma.projectParticipation.findFirst({
        where: { projectId, role: 'owner', status: 'active', deletedAt: null },
      });
      if (existingOwner) {
        throw new ConflictException('This project already has an active owner participation — end it first');
      }
    }

    const participation = await this.prisma.projectParticipation
      .create({
        data: {
          projectId,
          organizationId: dto.organizationId,
          role: dto.role,
          notes: dto.notes,
          createdByUserId: actor.userId,
        },
        include: { organization: { select: { id: true, name: true, type: true } } },
      })
      .catch((err) => {
        if (err?.code === 'P2002') {
          throw new ConflictException('This organization already participates in that role');
        }
        throw err;
      });

    this.eventBus.publish({
      event: 'participation.added',
      actor,
      subject: { type: 'project_participation', id: participation.id },
      data: { projectId, organizationId: dto.organizationId, role: dto.role },
    });
    return participation;
  }

  async endParticipation(actor: ActorContext, projectId: number, participationId: number) {
    await this.tenancy.assertProjectVisible(projectId);
    const participation = await this.prisma.projectParticipation.findFirst({
      where: { id: participationId, projectId, deletedAt: null },
    });
    if (!participation) throw new NotFoundException(`Participation #${participationId} not found`);
    if (participation.status === 'ended') throw new BadRequestException('Participation already ended');

    const ended = await this.prisma.projectParticipation.update({
      where: { id: participationId },
      data: { status: 'ended', endedAt: new Date() },
    });
    this.eventBus.publish({
      event: 'participation.ended',
      actor,
      subject: { type: 'project_participation', id: participationId },
      data: { projectId, organizationId: participation.organizationId, role: participation.role },
    });
    return ended;
  }

  // ─── Project-scope grants (W6-E5-S1, on the W2 D2 user-FKs) ─────────────────

  async grantProjectRole(actor: ActorContext, projectId: number, dto: { userId: number; role: string }) {
    await this.tenancy.assertProjectVisible(projectId);
    if (!PROJECT_ROLES.includes(dto.role)) {
      throw new BadRequestException(`Unknown project role "${dto.role}"`);
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);

    // The grantee must belong to the owner org or an actively participating
    // org — that is what scopes joint-project access to real counterparts.
    const participatingOrgIds = [
      project.ownerOrganizationId,
      ...(
        await this.prisma.projectParticipation.findMany({
          where: { projectId, status: 'active', deletedAt: null },
          select: { organizationId: true },
        })
      ).map((p) => p.organizationId),
    ];
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: dto.userId, organizationId: { in: participatingOrgIds }, status: 'active', deletedAt: null },
    });
    if (!membership) {
      throw new BadRequestException(
        'User is not an active member of the owner or any participating organization',
      );
    }

    const existing = await this.prisma.roleAssignment.findFirst({
      where: { userId: dto.userId, role: dto.role, scopeType: 'project', scopeId: projectId },
    });
    if (existing) throw new ConflictException('Role already granted');

    const grant = await this.prisma.roleAssignment.create({
      data: { userId: dto.userId, role: dto.role, scopeType: 'project', scopeId: projectId, grantedBy: actor.userId },
    });
    this.eventBus.publish({
      event: 'role.granted',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId: dto.userId, role: dto.role, scopeType: 'project', scopeId: projectId },
    });
    return grant;
  }

  async revokeProjectRole(actor: ActorContext, projectId: number, userId: number, role: string) {
    await this.tenancy.assertProjectVisible(projectId);
    const grant = await this.prisma.roleAssignment.findFirst({
      where: { userId, role, scopeType: 'project', scopeId: projectId },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    await this.prisma.roleAssignment.delete({ where: { id: grant.id } });
    this.eventBus.publish({
      event: 'role.revoked',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId, role, scopeType: 'project', scopeId: projectId },
    });
  }

  /**
   * Assignee picker payload (W6-E5-S1): members of the owner org plus every
   * holder of a project-scope grant (participation-org members admitted to
   * exactly this project).
   */
  async assignableUsers(projectId: number) {
    await this.tenancy.assertProjectVisible(projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);

    const [ownerMembers, projectGrants] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { organizationId: project.ownerOrganizationId, status: 'active', deletedAt: null },
        include: { user: { select: { id: true, email: true, referenceType: true, referenceId: true } } },
      }),
      this.prisma.roleAssignment.findMany({
        where: { scopeType: 'project', scopeId: projectId },
        include: { user: { select: { id: true, email: true, referenceType: true, referenceId: true } } },
      }),
    ]);

    const byUserId = new Map<
      number,
      { userId: number; email: string; referenceType: string; referenceId: number; source: string; projectRoles: string[] }
    >();
    for (const member of ownerMembers) {
      byUserId.set(member.userId, {
        userId: member.userId,
        email: member.user.email,
        referenceType: member.user.referenceType,
        referenceId: member.user.referenceId,
        source: 'owner_organization',
        projectRoles: [],
      });
    }
    for (const grant of projectGrants) {
      const entry = byUserId.get(grant.userId) ?? {
        userId: grant.userId,
        email: grant.user.email,
        referenceType: grant.user.referenceType,
        referenceId: grant.user.referenceId,
        source: 'project_grant',
        projectRoles: [],
      };
      entry.projectRoles.push(grant.role);
      byUserId.set(grant.userId, entry);
    }

    // display names for admin-backed users (the picker's label)
    const adminIds = [...byUserId.values()]
      .filter((u) => u.referenceType === 'admin')
      .map((u) => u.referenceId);
    const admins = await this.prisma.admin.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    return [...byUserId.values()].map((u) => ({
      ...u,
      name:
        u.referenceType === 'admin'
          ? (() => {
              const admin = admins.find((a) => a.id === u.referenceId);
              return admin ? `${admin.firstName} ${admin.lastName}` : u.email;
            })()
          : u.email,
    }));
  }
}
