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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let ProjectsService = class ProjectsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query, userRole, financialOfficerId) {
        const { page = 1, limit = 15, category, location, search, isCompleted, lang, sortBy = 'createdAt', sortOrder = 'desc' } = query;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (category)
            where.category = category;
        if (location)
            where.location = { contains: location, mode: 'insensitive' };
        if (typeof isCompleted === 'boolean')
            where.isCompleted = isCompleted;
        if (userRole === client_1.AdminRole.financial_officer && financialOfficerId) {
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
        const validSortFields = {
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
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async findById(id, lang) {
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
        if (!project)
            throw new common_1.NotFoundException(`Project #${id} not found`);
        const collectedAmount = project.donations.reduce((sum, d) => sum + Number(d.amount), 0);
        return { ...project, collectedAmount };
    }
    async create(dto) {
        const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
        if (!block)
            throw new common_1.NotFoundException(`Block #${dto.blockId} not found`);
        const existing = await this.prisma.project.findUnique({ where: { blockId: dto.blockId } });
        if (existing)
            throw new common_1.BadRequestException('This block already has a project');
        if (dto.financialOfficerId) {
            const officer = await this.prisma.admin.findFirst({
                where: { id: dto.financialOfficerId, role: client_1.AdminRole.financial_officer },
            });
            if (!officer)
                throw new common_1.NotFoundException(`Financial officer #${dto.financialOfficerId} not found`);
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
    async update(id, dto) {
        const project = await this.prisma.project.findUnique({ where: { id } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${id} not found`);
        if (project.isCompleted)
            throw new common_1.BadRequestException('Completed projects cannot be modified');
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
    async remove(id) {
        const project = await this.prisma.project.findUnique({ where: { id } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${id} not found`);
        await this.prisma.project.delete({ where: { id } });
    }
    async recalculateProgress(projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            return;
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
        const collected = Number(cashResult._sum.amount ?? 0) + Number(onlineResult._sum.amount ?? 0);
        const value = Number(project.value);
        const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
        const isCompleted = collected >= value;
        await this.prisma.project.update({
            where: { id: projectId },
            data: { progression, isCompleted },
        });
    }
    async assignFinancialOfficer(projectId, officerId) {
        const [project, officer] = await Promise.all([
            this.prisma.project.findUnique({ where: { id: projectId } }),
            this.prisma.admin.findFirst({ where: { id: officerId, role: client_1.AdminRole.financial_officer } }),
        ]);
        if (!project)
            throw new common_1.NotFoundException(`Project #${projectId} not found`);
        if (!officer)
            throw new common_1.NotFoundException(`Financial officer #${officerId} not found`);
        return this.prisma.project.update({
            where: { id: projectId },
            data: { financialOfficerId: officerId },
        });
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map