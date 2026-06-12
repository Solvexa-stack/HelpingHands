import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { AdminRole } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ProjectQueryDto, userRole?: string, financialOfficerId?: number) {
    const { page = 1, limit = 15, category, location, search, isCompleted, lang, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (category) where.category = category;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (typeof isCompleted === 'boolean') where.isCompleted = isCompleted;

    // Financial officers only see their assigned projects
    if (userRole === AdminRole.financial_officer && financialOfficerId) {
      where.financialOfficerId = financialOfficerId;
    }

    if (search) {
      where.block = {
        translations: {
          some: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { brief: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    const validSortFields: Record<string, any> = {
      createdAt: { createdAt: sortOrder },
      value: { value: sortOrder },
      progression: { progression: sortOrder },
    };

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: validSortFields[sortBy] || { createdAt: sortOrder },
        include: {
          block: {
            include: {
              translations: lang ? { where: { languageCode: lang } } : true,
              files: { where: { isActive: true, isCover: true }, take: 1 },
            },
          },
          financialOfficer: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { donations: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number, lang?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        block: {
          include: {
            translations: lang ? { where: { languageCode: lang } } : true,
            files: { where: { isActive: true }, orderBy: [{ isCover: 'desc' }, { orderId: 'asc' }] },
          },
        },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { donations: true } },
        donations: {
          where: { status: 'approved' },
          select: { amount: true },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project #${id} not found`);

    const collectedAmount = project.donations.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );

    return { ...project, collectedAmount };
  }

  async create(dto: CreateProjectDto) {
    const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
    if (!block) throw new NotFoundException(`Block #${dto.blockId} not found`);

    const existing = await this.prisma.project.findUnique({ where: { blockId: dto.blockId } });
    if (existing) throw new BadRequestException('This block already has a project');

    if (dto.financialOfficerId) {
      const officer = await this.prisma.admin.findFirst({
        where: { id: dto.financialOfficerId, role: AdminRole.financial_officer },
      });
      if (!officer) throw new NotFoundException(`Financial officer #${dto.financialOfficerId} not found`);
    }

    return this.prisma.project.create({
      data: {
        blockId: dto.blockId,
        location: dto.location,
        value: dto.value,
        category: dto.category,
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : undefined,
        dateOfCompletion: dto.dateOfCompletion ? new Date(dto.dateOfCompletion) : undefined,
        financialOfficerId: dto.financialOfficerId,
      },
      include: {
        block: { include: { translations: true } },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(id: number, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    if (project.isCompleted) throw new BadRequestException('Completed projects cannot be modified');

    const { blockId, ...updateData } = dto;

    return this.prisma.project.update({
      where: { id },
      data: {
        ...updateData,
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : undefined,
        dateOfCompletion: dto.dateOfCompletion ? new Date(dto.dateOfCompletion) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(id: number) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    await this.prisma.project.delete({ where: { id } });
  }

  async recalculateProgress(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    const [cashResult, onlineResult] = await Promise.all([
      this.prisma.projectDonation.aggregate({
        where: { projectId, status: 'approved' },
        _sum: { amount: true },
      }),
      this.prisma.onlineDonation.aggregate({
        where: { projectId, status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    const collected =
      Number(cashResult._sum.amount ?? 0) + Number(onlineResult._sum.amount ?? 0);
    const value = Number(project.value);
    const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
    const isCompleted = collected >= value;

    await this.prisma.project.update({
      where: { id: projectId },
      data: { progression, isCompleted },
    });
  }

  async assignFinancialOfficer(projectId: number, officerId: number) {
    const [project, officer] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.admin.findFirst({ where: { id: officerId, role: AdminRole.financial_officer } }),
    ]);

    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    if (!officer) throw new NotFoundException(`Financial officer #${officerId} not found`);

    return this.prisma.project.update({
      where: { id: projectId },
      data: { financialOfficerId: officerId },
    });
  }
}
