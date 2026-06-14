import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateStepDto, UpdateStepDto, UpdateProgressDto,
  CreatePhaseDto, UpdatePhaseDto,
  CreateTaskDto, UpdateTaskDto,
} from './dto/execution.dto';

@Injectable()
export class ExecutionService {
  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getProjectBlockId(projectId: number): Promise<number> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    return project.blockId;
  }

  private async assertBlockExists(blockId: number) {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException(`Block #${blockId} not found`);
  }

  // ─── Steps ────────────────────────────────────────────────────────────────

  async findSteps(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectStep.findMany({
      where: { projectId: projectBlockId, parentId: null },
      include: {
        block: { include: { translations: true } },
        children: {
          include: { block: { include: { translations: true } } },
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: { priority: 'asc' },
    });
  }

  async createStep(projectId: number, dto: CreateStepDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    if (dto.parentId) {
      const parent = await this.prisma.projectStep.findFirst({
        where: { id: dto.parentId, projectId: projectBlockId },
      });
      if (!parent) throw new NotFoundException(`Parent step #${dto.parentId} not found in this project`);
    }

    return this.prisma.projectStep.create({
      data: {
        projectId: projectBlockId,
        blockId: dto.blockId,
        parentId: dto.parentId,
        status: dto.status,
        priority: dto.priority ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async updateStep(projectId: number, stepId: number, dto: UpdateStepDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
    if (!step) throw new NotFoundException(`Step #${stepId} not found`);

    const { blockId, ...rest } = dto;
    return this.prisma.projectStep.update({
      where: { id: stepId },
      data: {
        ...rest,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async updateStepProgress(projectId: number, stepId: number, dto: UpdateProgressDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
    if (!step) throw new NotFoundException(`Step #${stepId} not found`);

    return this.prisma.projectStep.update({
      where: { id: stepId },
      data: { progress: dto.progress },
    });
  }

  async removeStep(projectId: number, stepId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
    if (!step) throw new NotFoundException(`Step #${stepId} not found`);
    await this.prisma.projectStep.delete({ where: { id: stepId } });
  }

  // ─── Phases ───────────────────────────────────────────────────────────────

  async findPhases(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectPhase.findMany({
      where: { projectId: projectBlockId },
      include: {
        block: { include: { translations: true } },
        tasks: {
          include: { block: { include: { translations: true } }, assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async createPhase(projectId: number, dto: CreatePhaseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    return this.prisma.projectPhase.create({
      data: {
        projectId: projectBlockId,
        blockId: dto.blockId,
        order: dto.order ?? 0,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async updatePhase(projectId: number, phaseId: number, dto: UpdatePhaseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: projectBlockId } });
    if (!phase) throw new NotFoundException(`Phase #${phaseId} not found`);

    const { blockId, ...rest } = dto;
    return this.prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...rest,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  async removePhase(projectId: number, phaseId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: projectBlockId } });
    if (!phase) throw new NotFoundException(`Phase #${phaseId} not found`);
    await this.prisma.projectPhase.delete({ where: { id: phaseId } });
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async findTasks(projectId: number, phaseId?: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectTask.findMany({
      where: { projectId: projectBlockId, ...(phaseId ? { phaseId } : {}) },
      include: {
        block: { include: { translations: true } },
        phase: { include: { block: { include: { translations: true } } } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTask(projectId: number, dto: CreateTaskDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    if (dto.phaseId) {
      const phase = await this.prisma.projectPhase.findFirst({ where: { id: dto.phaseId, projectId: projectBlockId } });
      if (!phase) throw new NotFoundException(`Phase #${dto.phaseId} not found in this project`);
    }

    return this.prisma.projectTask.create({
      data: {
        projectId: projectBlockId,
        blockId: dto.blockId,
        phaseId: dto.phaseId,
        assignedToId: dto.assignedToId,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateTask(projectId: number, taskId: number, dto: UpdateTaskDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectId: projectBlockId } });
    if (!task) throw new NotFoundException(`Task #${taskId} not found`);

    const { blockId, ...rest } = dto;
    return this.prisma.projectTask.update({
      where: { id: taskId },
      data: {
        ...rest,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async removeTask(projectId: number, taskId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectId: projectBlockId } });
    if (!task) throw new NotFoundException(`Task #${taskId} not found`);
    await this.prisma.projectTask.delete({ where: { id: taskId } });
  }
}
