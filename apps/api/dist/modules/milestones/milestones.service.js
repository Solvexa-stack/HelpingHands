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
exports.MilestonesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let MilestonesService = class MilestonesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProjectBlockId(projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${projectId} not found`);
        return project.blockId;
    }
    async findAll(projectId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        return this.prisma.projectMilestone.findMany({
            where: { projectId: projectBlockId },
            include: { block: { include: { translations: true } } },
            orderBy: { targetDate: 'asc' },
        });
    }
    async create(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
        if (!block)
            throw new common_1.NotFoundException(`Block #${dto.blockId} not found`);
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
    async update(projectId, milestoneId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: projectBlockId } });
        if (!milestone)
            throw new common_1.NotFoundException(`Milestone #${milestoneId} not found`);
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
    async remove(projectId, milestoneId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: projectBlockId } });
        if (!milestone)
            throw new common_1.NotFoundException(`Milestone #${milestoneId} not found`);
        await this.prisma.projectMilestone.delete({ where: { id: milestoneId } });
    }
};
exports.MilestonesService = MilestonesService;
exports.MilestonesService = MilestonesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MilestonesService);
//# sourceMappingURL=milestones.service.js.map