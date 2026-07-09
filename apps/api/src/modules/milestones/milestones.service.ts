import { Injectable, NotFoundException } from '@nestjs/common';
import { MilestoneStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';

@Injectable()
export class MilestonesService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
  ) {}

  private async getProjectBlockId(projectId: number): Promise<number> {
    await this.tenancy.assertProjectVisible(projectId); // W2-E3-S1
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    return project.blockId;
  }

  async findAll(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectMilestone.findMany({
      where: { projectRefId: projectId },
      include: { block: { include: { translations: true } } },
      orderBy: { targetDate: 'asc' },
    });
  }

  async create(actor: ActorContext, projectId: number, dto: CreateMilestoneDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
    if (!block) throw new NotFoundException(`Block #${dto.blockId} not found`);

    const milestone = await this.prisma.projectMilestone.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
        blockId: dto.blockId,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: dto.status,
      },
      include: { block: { include: { translations: true } } },
    });

    this.eventBus.publish({
      event: 'milestone.created',
      actor,
      subject: { type: 'milestone', id: milestone.id },
      data: { projectId, targetDate: milestone.targetDate?.toISOString() ?? null },
    });

    return milestone;
  }

  async update(actor: ActorContext, projectId: number, milestoneId: number, dto: UpdateMilestoneDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectRefId: projectId } });
    if (!milestone) throw new NotFoundException(`Milestone #${milestoneId} not found`);

    const { blockId, ...rest } = dto;
    const updated = await this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        ...rest,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });

    if (dto.status === MilestoneStatus.completed || dto.status === MilestoneStatus.missed) {
      this.eventBus.publish({
        event: dto.status === MilestoneStatus.completed ? 'milestone.completed' : 'milestone.missed',
        actor,
        subject: { type: 'milestone', id: milestoneId },
        data: { projectId },
      });
    }

    return updated;
  }

  async remove(actor: ActorContext, projectId: number, milestoneId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectRefId: projectId } });
    if (!milestone) throw new NotFoundException(`Milestone #${milestoneId} not found`);
    await this.prisma.projectMilestone.delete({ where: { id: milestoneId } });

    this.eventBus.publish({
      event: 'milestone.deleted',
      actor,
      subject: { type: 'milestone', id: milestoneId },
      data: { projectId },
    });
  }
}
