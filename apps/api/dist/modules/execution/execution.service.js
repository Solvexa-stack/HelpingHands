"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ExecutionService = class ExecutionService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProjectBlockId(projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${projectId} not found`);
        return project.blockId;
    }
    async assertBlockExists(blockId) {
        const block = await this.prisma.block.findUnique({ where: { id: blockId } });
        if (!block)
            throw new common_1.NotFoundException(`Block #${blockId} not found`);
    }
    async findSteps(projectId) {
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
    async createStep(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        await this.assertBlockExists(dto.blockId);
        if (dto.parentId) {
            const parent = await this.prisma.projectStep.findFirst({
                where: { id: dto.parentId, projectId: projectBlockId },
            });
            if (!parent)
                throw new common_1.NotFoundException(`Parent step #${dto.parentId} not found in this project`);
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
    async updateStep(projectId, stepId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
        if (!step)
            throw new common_1.NotFoundException(`Step #${stepId} not found`);
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
    async updateStepProgress(projectId, stepId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
        if (!step)
            throw new common_1.NotFoundException(`Step #${stepId} not found`);
        return this.prisma.projectStep.update({
            where: { id: stepId },
            data: { progress: dto.progress },
        });
    }
    async removeStep(projectId, stepId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const step = await this.prisma.projectStep.findFirst({ where: { id: stepId, projectId: projectBlockId } });
        if (!step)
            throw new common_1.NotFoundException(`Step #${stepId} not found`);
        await this.prisma.projectStep.delete({ where: { id: stepId } });
    }
    async findPhases(projectId) {
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
    async createPhase(projectId, dto) {
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
    async updatePhase(projectId, phaseId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: projectBlockId } });
        if (!phase)
            throw new common_1.NotFoundException(`Phase #${phaseId} not found`);
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
    async removePhase(projectId, phaseId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: projectBlockId } });
        if (!phase)
            throw new common_1.NotFoundException(`Phase #${phaseId} not found`);
        await this.prisma.projectPhase.delete({ where: { id: phaseId } });
    }
    async findTasks(projectId, phaseId) {
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
    async createTask(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        await this.assertBlockExists(dto.blockId);
        if (dto.phaseId) {
            const phase = await this.prisma.projectPhase.findFirst({ where: { id: dto.phaseId, projectId: projectBlockId } });
            if (!phase)
                throw new common_1.NotFoundException(`Phase #${dto.phaseId} not found in this project`);
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
    async updateTask(projectId, taskId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectId: projectBlockId } });
        if (!task)
            throw new common_1.NotFoundException(`Task #${taskId} not found`);
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
    async removeTask(projectId, taskId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const task = await this.prisma.projectTask.findFirst({ where: { id: taskId, projectId: projectBlockId } });
        if (!task)
            throw new common_1.NotFoundException(`Task #${taskId} not found`);
        await this.prisma.projectTask.delete({ where: { id: taskId } });
    }
};
exports.ExecutionService = ExecutionService;
exports.ExecutionService = ExecutionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExecutionService);
//# sourceMappingURL=execution.service.js.map