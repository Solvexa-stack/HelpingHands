"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudyService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pagination_dto_1 = require("../../common/dto/pagination.dto");
const prisma_service_1 = require("../../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const VALID_TRANSITIONS = {
    [client_1.StudyStatus.draft]: [client_1.StudyStatus.in_review],
    [client_1.StudyStatus.in_review]: [client_1.StudyStatus.published, client_1.StudyStatus.draft],
    [client_1.StudyStatus.published]: [client_1.StudyStatus.voting_open],
    [client_1.StudyStatus.voting_open]: [client_1.StudyStatus.voting_closed, client_1.StudyStatus.voting_open],
    [client_1.StudyStatus.voting_closed]: [client_1.StudyStatus.approved, client_1.StudyStatus.rejected, client_1.StudyStatus.in_review],
};
const ADMIN_ONLY_TARGETS = new Set([
    client_1.StudyStatus.published,
    client_1.StudyStatus.voting_open,
    client_1.StudyStatus.voting_closed,
    client_1.StudyStatus.approved,
    client_1.StudyStatus.rejected,
]);
const CATEGORY_TO_TYPE = {
    agricultural: client_1.ProjectType.agricultural,
    industrial: client_1.ProjectType.industrial,
    trading: client_1.ProjectType.trading,
};
let StudyService = class StudyService {
    constructor(prisma, config, notificationsService) {
        this.prisma = prisma;
        this.config = config;
        this.notificationsService = notificationsService;
    }
    async createStudy(dto, createdById) {
        const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${dto.projectId} not found`);
        const existing = await this.prisma.projectStudy.findUnique({
            where: { projectId: dto.projectId },
        });
        if (existing)
            throw new common_1.BadRequestException('This project already has a study');
        const projectType = CATEGORY_TO_TYPE[project.category] ?? client_1.ProjectType.trading;
        const templates = await this.prisma.studyDepartmentTemplate.findMany({
            where: { projectType, isActive: true },
            orderBy: { order: 'asc' },
        });
        const study = await this.prisma.projectStudy.create({
            data: {
                projectId: dto.projectId,
                status: client_1.StudyStatus.draft,
                summary: dto.summary,
                votingStartsAt: dto.votingStartsAt ? new Date(dto.votingStartsAt) : undefined,
                votingEndsAt: dto.votingEndsAt ? new Date(dto.votingEndsAt) : undefined,
                createdById,
                sections: {
                    create: templates.map((t) => ({
                        name: t.name,
                        nameAr: t.nameAr,
                        nameFr: t.nameFr,
                        description: t.description,
                        descriptionAr: t.descriptionAr,
                        descriptionFr: t.descriptionFr,
                        order: t.order,
                        isRequired: t.isRequired,
                        status: client_1.SectionStatus.pending,
                    })),
                },
            },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: { files: true, assignedAdmin: { select: { id: true, firstName: true, lastName: true } } },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        await this.prisma.project.update({
            where: { id: dto.projectId },
            data: { studyStatus: client_1.StudyStatus.draft },
        });
        return { ...study, votesSummary: { for: 0, against: 0, abstain: 0, total: 0 } };
    }
    async getStudy(studyId) {
        const study = await this.prisma.projectStudy.findUnique({
            where: { id: studyId },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: {
                        files: true,
                        assignedAdmin: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                approvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        return { ...study, votesSummary: await this.buildVotesSummary(study.id) };
    }
    async getStudyByProject(projectId) {
        const study = await this.prisma.projectStudy.findFirst({
            where: {
                projectId,
                status: {
                    in: [
                        client_1.StudyStatus.published,
                        client_1.StudyStatus.voting_open,
                        client_1.StudyStatus.voting_closed,
                        client_1.StudyStatus.approved,
                    ],
                },
            },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: { files: true },
                },
            },
        });
        if (!study)
            throw new common_1.NotFoundException('No published study found for this project');
        return { ...study, votesSummary: await this.buildVotesSummary(study.id) };
    }
    async listStudies(filters, user) {
        const { status, projectId, page = 1, limit = 15 } = filters;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (status)
            where.status = status;
        if (projectId)
            where.projectId = projectId;
        if (user.role === client_1.AdminRole.financial_officer) {
            const assigned = await this.prisma.project.findMany({
                where: { financialOfficerId: user.referenceId },
                select: { id: true },
            });
            where.projectId = { in: assigned.map((p) => p.id) };
        }
        const [data, total] = await Promise.all([
            this.prisma.projectStudy.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    project: { include: { block: { include: { translations: true } } } },
                    createdBy: { select: { id: true, firstName: true, lastName: true } },
                    _count: { select: { sections: true, votes: true } },
                },
            }),
            this.prisma.projectStudy.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async updateSection(sectionId, dto, requestingAdminId, requestingRole) {
        const section = await this.prisma.studySection.findUnique({
            where: { id: sectionId },
            include: { study: true },
        });
        if (!section)
            throw new common_1.NotFoundException(`Section #${sectionId} not found`);
        if (requestingRole !== client_1.AdminRole.administrator &&
            section.assignedTo !== requestingAdminId) {
            throw new common_1.ForbiddenException('You are not assigned to this section');
        }
        const updated = await this.prisma.studySection.update({
            where: { id: sectionId },
            data: {
                content: dto.content,
                status: dto.status,
                assignedTo: dto.assignedTo,
                completedAt: dto.status === client_1.SectionStatus.completed
                    ? new Date()
                    : dto.status !== undefined
                        ? null
                        : undefined,
            },
        });
        if (dto.status === client_1.SectionStatus.completed &&
            section.study.status === client_1.StudyStatus.draft) {
            const pendingRequired = await this.prisma.studySection.count({
                where: {
                    studyId: section.studyId,
                    isRequired: true,
                    status: { not: client_1.SectionStatus.completed },
                },
            });
            if (pendingRequired === 0) {
                await this.prisma.projectStudy.update({
                    where: { id: section.studyId },
                    data: { status: client_1.StudyStatus.in_review },
                });
                await this.prisma.project.update({
                    where: { id: section.study.projectId },
                    data: { studyStatus: client_1.StudyStatus.in_review },
                });
            }
        }
        return updated;
    }
    async uploadSectionFiles(sectionId, files) {
        const section = await this.prisma.studySection.findUnique({ where: { id: sectionId } });
        if (!section)
            throw new common_1.NotFoundException(`Section #${sectionId} not found`);
        const appUrl = this.config.get('app.url', 'http://localhost:4000');
        return Promise.all(files.map((file) => this.prisma.studySectionFile.create({
            data: {
                sectionId,
                name: file.originalname,
                url: `${appUrl}/uploads/${file.filename}`,
                fileType: this.resolveFileType(file.mimetype),
            },
        })));
    }
    async deleteSectionFile(fileId) {
        const file = await this.prisma.studySectionFile.findUnique({ where: { id: fileId } });
        if (!file)
            throw new common_1.NotFoundException(`File #${fileId} not found`);
        try {
            const uploadDir = this.config.get('app.uploadDir', './uploads');
            const filename = file.url.split('/uploads/').pop();
            if (filename) {
                const filePath = path.join(process.cwd(), uploadDir.replace('./', ''), filename);
                if (fs.existsSync(filePath))
                    fs.unlinkSync(filePath);
            }
        }
        catch {
        }
        await this.prisma.studySectionFile.delete({ where: { id: fileId } });
    }
    async changeStatus(studyId, dto, adminId, adminRole) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        const allowed = VALID_TRANSITIONS[study.status] ?? [];
        if (!allowed.includes(dto.status)) {
            throw new common_1.BadRequestException(`Cannot transition from "${study.status}" to "${dto.status}"`);
        }
        if (ADMIN_ONLY_TARGETS.has(dto.status) && adminRole !== client_1.AdminRole.administrator) {
            throw new common_1.ForbiddenException('Only administrators can perform this status change');
        }
        if (dto.status === client_1.StudyStatus.rejected && !dto.rejectionReason) {
            throw new common_1.BadRequestException('Rejection reason is required');
        }
        const updateData = { status: dto.status };
        if (dto.status === client_1.StudyStatus.published)
            updateData.publishedAt = new Date();
        if (dto.status === client_1.StudyStatus.voting_open) {
            if (!study.votingStartsAt) {
                updateData.votingStartsAt = dto.votingStartsAt ? new Date(dto.votingStartsAt) : new Date();
            }
            if (dto.votingEndsAt)
                updateData.votingEndsAt = new Date(dto.votingEndsAt);
        }
        if (dto.status === client_1.StudyStatus.voting_closed)
            updateData.votingEndsAt = new Date();
        if (dto.status === client_1.StudyStatus.approved) {
            updateData.approvedById = adminId;
            updateData.approvedAt = new Date();
        }
        if (dto.rejectionReason)
            updateData.rejectionReason = dto.rejectionReason;
        const [updatedStudy] = await this.prisma.$transaction([
            this.prisma.projectStudy.update({ where: { id: studyId }, data: updateData }),
            this.prisma.project.update({
                where: { id: study.projectId },
                data: { studyStatus: dto.status },
            }),
        ]);
        this.fireStatusNotification(dto.status, studyId, study.projectId, adminId, dto.rejectionReason);
        return updatedStudy;
    }
    fireStatusNotification(status, studyId, projectId, adminId, reason) {
        switch (status) {
            case client_1.StudyStatus.published:
                this.notificationsService.notify({ type: 'study_published', studyId, projectId }).catch(() => null);
                break;
            case client_1.StudyStatus.voting_open:
                this.notificationsService.notify({ type: 'voting_open', studyId, projectId }).catch(() => null);
                break;
            case client_1.StudyStatus.approved:
                this.notificationsService.notify({ type: 'study_approved', studyId, projectId }).catch(() => null);
                break;
            case client_1.StudyStatus.rejected:
                this.notificationsService
                    .notify({ type: 'study_rejected', studyId, adminId, reason: reason ?? '' })
                    .catch(() => null);
                break;
        }
    }
    async deleteStudy(studyId) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        if (study.status !== client_1.StudyStatus.draft) {
            throw new common_1.BadRequestException('Only draft studies can be deleted');
        }
        await this.prisma.$transaction([
            this.prisma.projectStudy.delete({ where: { id: studyId } }),
            this.prisma.project.update({
                where: { id: study.projectId },
                data: { studyStatus: null },
            }),
        ]);
    }
    async buildVotesSummary(studyId) {
        const groups = await this.prisma.studyVote.groupBy({
            by: ['choice'],
            where: { studyId },
            _count: { choice: true },
        });
        const summary = { for: 0, against: 0, abstain: 0, total: 0 };
        for (const g of groups) {
            summary[g.choice] = g._count.choice;
            summary.total += g._count.choice;
        }
        return summary;
    }
    resolveFileType(mimetype) {
        if (mimetype.startsWith('image/'))
            return client_1.FileType.image;
        if (mimetype.startsWith('video/'))
            return client_1.FileType.video;
        return client_1.FileType.pdf;
    }
};
exports.StudyService = StudyService;
exports.StudyService = StudyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, notifications_service_1.NotificationsService])
], StudyService);
//# sourceMappingURL=study.service.js.map