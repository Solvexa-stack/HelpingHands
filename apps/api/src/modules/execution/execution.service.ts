import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PhaseStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { WorkflowService } from '../workflow/workflow.service';
import { workflowEnforced } from '../workflow/workflow.types';
import {
  CreateStepDto, UpdateStepDto, UpdateProgressDto,
  CreatePhaseDto, UpdatePhaseDto,
  CreateTaskDto, UpdateTaskDto,
} from './dto/execution.dto';

@Injectable()
export class ExecutionService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
    private workflow: WorkflowService,
  ) {}

  /** W4-E4-S4: the first execution phase moves donations_open → executing. */
  private async markExecuting(actor: ActorContext, projectId: number): Promise<void> {
    if (!workflowEnforced('execution')) return;
    const instance = await this.workflow.instanceFor({ subjectType: 'project', subjectId: projectId });
    if (instance?.currentStateKey !== 'donations_open') return; // legacy allows phases at any stage
    await this.workflow
      .execute(actor, { subjectType: 'project', subjectId: projectId }, 'begin_execution', {
        note: 'first execution phase created',
      })
      .catch(() => null);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getProjectBlockId(projectId: number): Promise<number> {
    await this.tenancy.assertProjectVisible(projectId); // W2-E3-S1
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
      where: { projectRefId: projectId, parentId: null },
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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createStep(projectId: number, dto: CreateStepDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    if (dto.parentId) {
      const parent = await this.prisma.projectStep.findFirst({
        where: { id: dto.parentId, projectRefId: projectId },
      });
      if (!parent) throw new NotFoundException(`Parent step #${dto.parentId} not found in this project`);
    }

    return this.prisma.projectStep.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateStep(projectId: number, stepId: number, dto: UpdateStepDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectRefId: projectId } });
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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateStepProgress(projectId: number, stepId: number, dto: UpdateProgressDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectRefId: projectId } });
    if (!step) throw new NotFoundException(`Step #${stepId} not found`);

    return this.prisma.projectStep.update({
      where: { id: stepId },
      data: { progress: dto.progress },
    });
  }

  async removeStep(actor: ActorContext, projectId: number, stepId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectRefId: projectId } });
    if (!step) throw new NotFoundException(`Step #${stepId} not found`);
    await this.prisma.projectStep.delete({ where: { id: stepId } });

    this.eventBus.publish({
      event: 'step.deleted',
      actor,
      subject: { type: 'step', id: stepId },
      data: { projectId },
    });
  }

  // ─── Phases ───────────────────────────────────────────────────────────────

  async findPhases(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectPhase.findMany({
      where: { projectRefId: projectId },
      include: {
        block: { include: { translations: true } },
        tasks: {
          include: { block: { include: { translations: true } }, assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async createPhase(actor: ActorContext, projectId: number, dto: CreatePhaseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    const phase = await this.prisma.projectPhase.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
        blockId: dto.blockId,
        order: dto.order ?? 0,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });

    this.eventBus.publish({
      event: 'phase.created',
      actor,
      subject: { type: 'phase', id: phase.id },
      data: { projectId, order: phase.order },
    });

    await this.markExecuting(actor, projectId);
    return phase;
  }

  async updatePhase(actor: ActorContext, projectId: number, phaseId: number, dto: UpdatePhaseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectRefId: projectId } });
    if (!phase) throw new NotFoundException(`Phase #${phaseId} not found`);

    const { blockId, ...rest } = dto;
    const updated = await this.prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...rest,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { block: { include: { translations: true } } },
    });

    if (dto.status === PhaseStatus.in_progress) {
      this.eventBus.publish({
        event: 'phase.started',
        actor,
        subject: { type: 'phase', id: phaseId },
        data: { projectId },
      });
    } else if (dto.status === PhaseStatus.completed) {
      this.eventBus.publish({
        event: 'phase.completed',
        actor,
        subject: { type: 'phase', id: phaseId },
        data: { projectId },
      });
    }

    return updated;
  }

  async removePhase(actor: ActorContext, projectId: number, phaseId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectRefId: projectId } });
    if (!phase) throw new NotFoundException(`Phase #${phaseId} not found`);
    await this.prisma.projectPhase.delete({ where: { id: phaseId } });

    this.eventBus.publish({
      event: 'phase.deleted',
      actor,
      subject: { type: 'phase', id: phaseId },
      data: { projectId },
    });
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async findTasks(projectId: number, phaseId?: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectTask.findMany({
      where: { projectRefId: projectId, ...(phaseId ? { phaseId } : {}) },
      include: {
        block: { include: { translations: true } },
        phase: { include: { block: { include: { translations: true } } } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** W2-E2-S2 (D2): resolve the twin FK pair for a task assignee. */
  private async resolveAssignee(dto: { assignedToId?: number; assignedToUserId?: number }) {
    if (dto.assignedToUserId !== undefined) {
      // New generation: any org member user; legacy Admin-FK only when the user is an admin
      const user = await this.prisma.user.findUnique({ where: { id: dto.assignedToUserId } });
      if (!user) throw new NotFoundException(`User #${dto.assignedToUserId} not found`);
      return {
        assignedToId: user.referenceType === 'admin' ? user.referenceId : null,
        assignedToUserId: user.id,
      };
    }
    if (dto.assignedToId !== undefined) {
      const user = await this.prisma.user.findFirst({
        where: { referenceType: 'admin', referenceId: dto.assignedToId },
      });
      return { assignedToId: dto.assignedToId, assignedToUserId: user?.id ?? null };
    }
    return {};
  }

  async createTask(actor: ActorContext, projectId: number, dto: CreateTaskDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    if (dto.phaseId) {
      const phase = await this.prisma.projectPhase.findFirst({ where: { id: dto.phaseId, projectRefId: projectId } });
      if (!phase) throw new NotFoundException(`Phase #${dto.phaseId} not found in this project`);
    }

    const task = await this.prisma.projectTask.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
        blockId: dto.blockId,
        phaseId: dto.phaseId,
        ...(await this.resolveAssignee(dto)),
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.eventBus.publish({
      event: 'task.created',
      actor,
      subject: { type: 'task', id: task.id },
      data: { projectId, phaseId: dto.phaseId ?? null, assignedToId: dto.assignedToId ?? null },
    });

    return task;
  }

  async updateTask(actor: ActorContext, projectId: number, taskId: number, dto: UpdateTaskDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectRefId: projectId } });
    if (!task) throw new NotFoundException(`Task #${taskId} not found`);

    const { blockId, assignedToId, assignedToUserId, ...rest } = dto;
    const updated = await this.prisma.projectTask.update({
      where: { id: taskId },
      data: {
        ...rest,
        ...(await this.resolveAssignee(dto)),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        assignedUser: { select: { id: true, email: true, referenceType: true } },
      },
    });

    this.eventBus.publish({
      event: dto.status === TaskStatus.completed ? 'task.completed' : 'task.updated',
      actor,
      subject: { type: 'task', id: taskId },
      data: { projectId, changedFields: Object.keys(rest) },
    });

    return updated;
  }

  async removeTask(actor: ActorContext, projectId: number, taskId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectRefId: projectId } });
    if (!task) throw new NotFoundException(`Task #${taskId} not found`);
    await this.prisma.projectTask.delete({ where: { id: taskId } });

    this.eventBus.publish({
      event: 'task.deleted',
      actor,
      subject: { type: 'task', id: taskId },
      data: { projectId },
    });
  }
}
