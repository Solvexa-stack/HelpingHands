import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { ROLE_GRANT_MAPPING } from './role-parity.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import { AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PaginationDto, paginate, paginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class AdminsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /**
   * W1-E6-S1 — dual-write: RoleAssignment is the source of truth for role
   * changes; the AdminRole enum stays synced (new → old) until Wave 8.
   * Managed grants (those in the mapping) are replaced; others untouched.
   */
  private async syncGrants(actor: ActorContext, userId: number, role: string) {
    const defaultOrg = await this.prisma.organization.findFirst({
      where: { type: 'ngo', name: 'HelpingHands' },
    });
    const managedRoles = Object.values(ROLE_GRANT_MAPPING).flat();
    const existing = await this.prisma.roleAssignment.findMany({ where: { userId } });

    for (const grant of existing) {
      const managed = managedRoles.some(
        (m) => m.role === grant.role && m.scopeType === grant.scopeType,
      );
      const wanted = (ROLE_GRANT_MAPPING[role] ?? []).some(
        (m) => m.role === grant.role && m.scopeType === grant.scopeType,
      );
      if (managed && !wanted) {
        await this.prisma.roleAssignment.delete({ where: { id: grant.id } });
        this.eventBus.publish({
          event: 'role.revoked',
          actor,
          subject: { type: 'role_assignment', id: grant.id },
          data: { userId, role: grant.role, scopeType: grant.scopeType },
        });
      }
    }

    for (const wanted of ROLE_GRANT_MAPPING[role] ?? []) {
      const scopeId = wanted.scopeType === 'organization' ? (defaultOrg?.id ?? null) : null;
      const already = existing.some(
        (g) => g.role === wanted.role && g.scopeType === wanted.scopeType && g.deletedAt === null,
      );
      if (!already) {
        const created = await this.prisma.roleAssignment.create({
          data: { userId, role: wanted.role, scopeType: wanted.scopeType, scopeId, grantedBy: actor.userId },
        });
        this.eventBus.publish({
          event: 'role.granted',
          actor,
          subject: { type: 'role_assignment', id: created.id },
          data: { userId, role: wanted.role, scopeType: wanted.scopeType, scopeId },
        });
      }
    }
  }

  async findAll(query: PaginationDto, role?: AdminRole) {
    const { page = 1, limit = 15, search } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.admin.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } } },
      }),
      this.prisma.admin.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
        assignedProjects: {
          include: { block: { include: { translations: true } } },
        },
      },
    });
    if (!admin) throw new NotFoundException(`Admin #${id} not found`);
    return admin;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async create(actor: ActorContext, dto: CreateAdminDto, creatorRole: AdminRole) {
    if (creatorRole !== AdminRole.administrator) {
      throw new ForbiddenException('Only administrators can create admin accounts');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const admin = await this.prisma.admin.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        referenceId: admin.id,
        referenceType: 'admin',
        email: dto.email,
        password: hashedPassword,
        isActive: true,
        joiningDate: new Date(),
      },
    });

    await this.syncGrants(actor, user.id, admin.role);

    return { ...admin, user: { id: user.id, email: user.email, isActive: user.isActive } };
  }

  async update(actor: ActorContext, id: number, dto: UpdateAdminDto, updaterRole: AdminRole) {
    const admin = await this.findById(id);

    if (admin.role === AdminRole.administrator && updaterRole !== AdminRole.administrator) {
      throw new ForbiddenException('Cannot modify administrator accounts');
    }

    const { password, email, ...adminData } = dto;

    if (email || password) {
      const updates: any = {};
      if (email) {
        const existing = await this.prisma.user.findFirst({
          where: { email, NOT: { referenceId: id, referenceType: 'admin' } },
        });
        if (existing) throw new ConflictException('Email already in use');
        updates.email = email;
      }
      if (password) updates.password = await bcrypt.hash(password, 12);

      await this.prisma.user.updateMany({
        where: { referenceId: id, referenceType: 'admin' },
        data: updates,
      });
    }

    const updated = await this.prisma.admin.update({ where: { id }, data: adminData });

    if (dto.role && dto.role !== admin.role) {
      const user = await this.prisma.user.findFirst({
        where: { referenceId: id, referenceType: 'admin' },
      });
      if (user) await this.syncGrants(actor, user.id, dto.role);
    }

    return updated;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async toggleActive(id: number) {
    const admin = await this.findById(id);
    if (admin.role === AdminRole.administrator) {
      throw new ForbiddenException('Cannot deactivate administrator accounts');
    }
    const user = await this.prisma.user.findFirst({
      where: { referenceId: id, referenceType: 'admin' },
    });
    if (!user) throw new NotFoundException('User account not found');

    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: !user.isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  async findFinancialOfficers() {
    return this.prisma.admin.findMany({
      where: { role: AdminRole.financial_officer },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        assignedProjects: { select: { id: true } },
      },
    });
  }
}
