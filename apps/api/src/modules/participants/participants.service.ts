import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { PaginationDto, paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { AdminRole } from '@prisma/client';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Representation } from '@prisma/client';

export class UpdateParticipantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional({ enum: Representation }) @IsOptional() @IsEnum(Representation) representation?: Representation;
}

@Injectable()
export class ParticipantsService {
  constructor(
    private prisma: PrismaService,
    private tenancy: TenancyRepository,
  ) {}

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 15, search } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};

    // W2 isolation: an org workspace only sees participants who donated to its
    // own projects — there is no platform-wide people directory for tenants.
    const orgId = await this.tenancy.enforcedOrgId('participant.list');
    if (orgId != null) {
      where.donations = { some: { project: { ownerOrganizationId: orgId } } };
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.participant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
          _count: { select: { donations: true } },
        },
      }),
      this.prisma.participant.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number, requesterRole?: string, requesterReferenceId?: number) {
    // BUG-11 fix (pilot consolidation): a participant reads only their own
    // profile — foreign ids read as nonexistence (no information leak).
    if (requesterRole === 'participant' && requesterReferenceId !== id) {
      throw new NotFoundException(`Participant #${id} not found`);
    }
    // W2 isolation: cross-org participants read as nonexistence, and the
    // embedded donation history is limited to the workspace's own projects.
    const orgId = await this.tenancy.enforcedOrgId('participant.read');
    const donationWhere = orgId == null ? undefined : { project: { ownerOrganizationId: orgId } };

    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
        donations: {
          where: donationWhere,
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            project: {
              include: { block: { include: { translations: true } } },
            },
          },
        },
        _count: { select: { donations: donationWhere ? { where: donationWhere } : true } },
      },
    });
    if (!participant) throw new NotFoundException(`Participant #${id} not found`);

    if (orgId != null) {
      const related = await this.prisma.projectDonation.count({
        where: { participantId: id, project: { ownerOrganizationId: orgId } },
      });
      if (related === 0) throw new NotFoundException(`Participant #${id} not found`);
    }
    return participant;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async update(participantId: number, dto: UpdateParticipantDto, requestingUserId: number, role: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
      include: { user: true },
    });
    if (!participant) throw new NotFoundException(`Participant #${participantId} not found`);

    // Participants can only update their own profile
    if (role === 'participant' && participant.user?.id !== requestingUserId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.prisma.participant.update({ where: { id: participantId }, data: dto });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async toggleActive(id: number) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!participant) throw new NotFoundException(`Participant #${id} not found`);
    if (!participant.user) throw new NotFoundException('User account not found');

    return this.prisma.user.update({
      where: { id: participant.user.id },
      data: { isActive: !participant.user.isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateAvatar(participantId: number, avatarUrl: string) {
    return this.prisma.user.updateMany({
      where: { referenceId: participantId, referenceType: 'participant' },
      data: { avatar: avatarUrl },
    });
  }
}
