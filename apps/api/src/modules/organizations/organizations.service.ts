import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddMemberDto,
  CapabilitiesDto,
  CreateOrganizationDto,
  DEFAULT_CAPABILITIES,
  OrganizationQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';

/**
 * W1-E2 — platform-internal organization management. All routes are
 * administrator-only this wave (self-service joins arrive in Wave 2);
 * every mutation is announced on the event bus and therefore audited.
 *
 * Org types beyond ngo|board ship dark behind ORG_TYPES_ENABLED
 * (comma-separated list; owner: platform team; expanded per wave 2/6).
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  private enabledTypes(): Set<string> {
    return new Set(
      (process.env.ORG_TYPES_ENABLED ?? 'ngo,board').split(',').map((t) => t.trim()),
    );
  }

  async create(actor: ActorContext, dto: CreateOrganizationDto) {
    if (!this.enabledTypes().has(dto.type)) {
      throw new BadRequestException(
        `Organization type "${dto.type}" is not enabled on this platform yet`,
      );
    }

    if (dto.contentBlockId) {
      const block = await this.prisma.block.findUnique({ where: { id: dto.contentBlockId } });
      if (!block) throw new NotFoundException(`Block #${dto.contentBlockId} not found`);
    }

    const organization = await this.prisma.organization.create({
      data: {
        type: dto.type,
        name: dto.name,
        registrationNumber: dto.registrationNumber,
        contentBlockId: dto.contentBlockId,
        capabilities: DEFAULT_CAPABILITIES,
      },
    });

    this.eventBus.publish({
      event: 'organization.created',
      actor,
      subject: { type: 'organization', id: organization.id },
      data: { name: organization.name, orgType: organization.type },
    });

    return organization;
  }

  async findAll(query: OrganizationQueryDto) {
    const { page = 1, limit = 15 } = query;
    const { skip, take } = paginate(page, limit);
    const where: any = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'asc' },
        include: { _count: { select: { memberships: true, ownedProjects: true } } },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, email: true, referenceType: true } } },
        },
        _count: { select: { ownedProjects: true } },
      },
    });
    if (!organization) throw new NotFoundException(`Organization #${id} not found`);
    return organization;
  }

  async update(actor: ActorContext, id: number, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    if (!organization) throw new NotFoundException(`Organization #${id} not found`);

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name,
        registrationNumber: dto.registrationNumber,
        contentBlockId: dto.contentBlockId,
        status: dto.status,
      },
    });

    this.eventBus.publish({
      event: 'organization.updated',
      actor,
      subject: { type: 'organization', id },
      data: { changedFields: Object.keys(dto) },
    });

    return updated;
  }

  // ─── Capabilities (W1-E2-S2) ─────────────────────────────────────────────────

  async setCapabilities(actor: ActorContext, id: number, dto: CapabilitiesDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    if (!organization) throw new NotFoundException(`Organization #${id} not found`);

    const before = organization.capabilities;
    const after = { ...dto };

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { capabilities: after },
    });

    // before/after snapshots land verbatim in the audit trail
    this.eventBus.publish({
      event: 'capability.changed',
      actor,
      subject: { type: 'organization', id },
      data: { before, after },
    });

    return updated;
  }

  // ─── Memberships ─────────────────────────────────────────────────────────────

  async addMember(actor: ActorContext, organizationId: number, dto: AddMemberDto) {
    const [organization, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);
    if (!organization) throw new NotFoundException(`Organization #${organizationId} not found`);
    if (!user) throw new NotFoundException(`User #${dto.userId} not found`);

    const existing = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId: dto.userId },
    });
    if (existing) throw new ConflictException('User is already a member of this organization');

    const membership = await this.prisma.organizationMembership.create({
      data: { organizationId, userId: dto.userId, status: dto.status },
    });

    this.eventBus.publish({
      event: 'membership.added',
      actor,
      subject: { type: 'organization_membership', id: membership.id },
      data: { organizationId, userId: dto.userId },
    });

    return membership;
  }

  async removeMember(actor: ActorContext, organizationId: number, userId: number) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    await this.prisma.organizationMembership.delete({ where: { id: membership.id } });

    this.eventBus.publish({
      event: 'membership.removed',
      actor,
      subject: { type: 'organization_membership', id: membership.id },
      data: { organizationId, userId },
    });
  }

  async listMembers(organizationId: number) {
    await this.findById(organizationId);
    return this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, referenceType: true } } },
      orderBy: { id: 'asc' },
    });
  }
}
