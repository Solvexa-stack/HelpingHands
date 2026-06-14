import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';

@Injectable()
export class MilestonesService {
  constructor(private prisma: PrismaService) {}

  private async getProjectBlockId(projectId: number): Promise<number> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    return project.blockId;
  }

  async findAll(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectMilestone.findMany({
      where: { projectId: projectBlockId },
      include: { block: { include: { translations: true } } },
      orderBy: { targetDate: 'asc' },
    });
  }

  async create(projectId: number, dto: CreateMilestoneDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
    if (!block) throw new NotFoundException(`Block #${dto.blockId} not found`);

    return this.prisma.projectMilestone.create({
      data: {
        projectId: projectBlockId,
        blockId: dto.blockId,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: dto.status,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async update(projectId: number, milestoneId: number, dto: UpdateMilestoneDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: projectBlockId } });
    if (!milestone) throw new NotFoundException(`Milestone #${milestoneId} not found`);

    const { blockId, ...rest } = dto;
    return this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        ...rest,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async remove(projectId: number, milestoneId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: projectBlockId } });
    if (!milestone) throw new NotFoundException(`Milestone #${milestoneId} not found`);
    await this.prisma.projectMilestone.delete({ where: { id: milestoneId } });
  }
}
