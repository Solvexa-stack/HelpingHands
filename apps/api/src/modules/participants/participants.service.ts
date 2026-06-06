import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 15, search } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
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

  async findById(id: number) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            project: {
              include: { block: { include: { translations: true } } },
            },
          },
        },
        _count: { select: { donations: true } },
      },
    });
    if (!participant) throw new NotFoundException(`Participant #${id} not found`);
    return participant;
  }

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

  async updateAvatar(participantId: number, avatarUrl: string) {
    return this.prisma.user.updateMany({
      where: { referenceId: participantId, referenceType: 'participant' },
      data: { avatar: avatarUrl },
    });
  }
}
