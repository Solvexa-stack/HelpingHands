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
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  AddMemberDto,
  CapabilitiesDto,
  CreateOrganizationDto,
  DEFAULT_CAPABILITIES,
  InviteMemberDto,
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
    private emailService: EmailService,
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

    // Activation (manual mode this wave) stamps the verification columns;
    // self-service verification arrives with the engine (Wave 6).
    const activating = dto.status === 'active' && organization.status !== 'active';

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name,
        registrationNumber: dto.registrationNumber,
        contentBlockId: dto.contentBlockId,
        status: dto.status,
        ...(activating ? { verifiedAt: new Date(), verifiedBy: actor.userId } : {}),
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

  /**
   * W2-E6-S1: invite the first org_admin — account (reset flow for the
   * password), membership and org_admin grant in one audited step.
   */
  async inviteFirstAdmin(actor: ActorContext, organizationId: number, dto: InviteMemberDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException(`Organization #${organizationId} not found`);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    // Two onboarding modes: with dto.password the workspace owner sets the
    // credentials and the member can log in immediately; without it the
    // account starts with an unusable password and the invitee activates via
    // the reset-flow link.
    const directCredentials = Boolean(dto.password);

    const admin = await this.prisma.admin.create({
      data: { firstName: dto.firstName, lastName: dto.lastName, role: 'employee' },
    });
    const user = await this.prisma.user.create({
      data: {
        referenceId: admin.id,
        referenceType: 'admin',
        email: dto.email,
        password: await bcrypt.hash(directCredentials ? dto.password! : randomUUID(), 12),
        isActive: true,
        joiningDate: new Date(),
      },
    });
    const membership = await this.prisma.organizationMembership.create({
      data: { organizationId, userId: user.id },
    });
    const memberRole = dto.role ?? 'org_admin';
    const grant = await this.prisma.roleAssignment.create({
      data: { userId: user.id, role: memberRole, scopeType: 'organization', scopeId: organizationId, grantedBy: actor.userId },
    });

    // Activation-link mode only: invitation email rides the existing
    // reset-token flow (best-effort — dev environments usually have no SMTP,
    // hence the dev fallback below)
    const token = directCredentials ? null : randomUUID();
    if (token) {
      await this.prisma.passwordResetToken.create({
        data: { email: dto.email, token, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
      });
      this.emailService.sendPasswordResetEmail(dto.email, token).catch(() => null);
    }

    this.eventBus.publish({
      event: 'membership.added',
      actor,
      subject: { type: 'organization_membership', id: membership.id },
      data: { organizationId, userId: user.id, invitedAdmin: true },
    });
    this.eventBus.publish({
      event: 'role.granted',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId: user.id, role: 'org_admin', scopeType: 'organization', scopeId: organizationId },
    });

    if (directCredentials) {
      return {
        message: 'Member created — they can log in immediately with the credentials you set',
        userId: user.id,
        membershipId: membership.id,
        role: memberRole,
      };
    }

    // Dev fallback: outside production the activation link is returned in
    // the response so onboarding works without SMTP. Never exposed in prod.
    const devFallback =
      process.env.NODE_ENV === 'production'
        ? {}
        : { activationUrl: `/activate?token=${token}`, activationToken: token };

    return { message: 'Invitation created', userId: user.id, membershipId: membership.id, role: memberRole, ...devFallback };
  }

  /** W2-E5-S2: grant an org-scoped role from the catalog to a member. */
  async grantRole(actor: ActorContext, organizationId: number, userId: number, role: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, status: 'active' },
    });
    if (!membership) throw new NotFoundException('User is not a member of this organization');

    const existing = await this.prisma.roleAssignment.findFirst({
      where: { userId, role, scopeType: 'organization', scopeId: organizationId },
    });
    if (existing) throw new ConflictException('Role already granted');

    const grant = await this.prisma.roleAssignment.create({
      data: { userId, role, scopeType: 'organization', scopeId: organizationId, grantedBy: actor.userId },
    });

    this.eventBus.publish({
      event: 'role.granted',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId, role, scopeType: 'organization', scopeId: organizationId },
    });
    return grant;
  }

  async revokeRole(actor: ActorContext, organizationId: number, userId: number, role: string) {
    const grant = await this.prisma.roleAssignment.findFirst({
      where: { userId, role, scopeType: 'organization', scopeId: organizationId },
    });
    if (!grant) throw new NotFoundException('Grant not found');

    await this.prisma.roleAssignment.delete({ where: { id: grant.id } });
    this.eventBus.publish({
      event: 'role.revoked',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId, role, scopeType: 'organization', scopeId: organizationId },
    });
  }

  async listMembers(organizationId: number) {
    await this.findById(organizationId);
    const members = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, referenceType: true, referenceId: true } } },
      orderBy: { id: 'asc' },
    });
    const grants = await this.prisma.roleAssignment.findMany({
      where: { scopeType: 'organization', scopeId: organizationId },
    });
    const admins = await this.prisma.admin.findMany({
      where: { id: { in: members.filter((m) => m.user.referenceType === 'admin').map((m) => m.user.referenceId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    return members.map((m) => ({
      ...m,
      admin: m.user.referenceType === 'admin' ? (admins.find((a) => a.id === m.user.referenceId) ?? null) : null,
      roles: grants.filter((g) => g.userId === m.userId).map((g) => g.role),
    }));
  }
}
