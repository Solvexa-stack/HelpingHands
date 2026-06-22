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
exports.DonationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const qr_service_1 = require("../qr/qr.service");
const email_service_1 = require("../email/email.service");
const projects_service_1 = require("../projects/projects.service");
const notifications_service_1 = require("../notifications/notifications.service");
const client_1 = require("@prisma/client");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let DonationsService = class DonationsService {
    constructor(prisma, qrService, emailService, projectsService, notificationsService) {
        this.prisma = prisma;
        this.qrService = qrService;
        this.emailService = emailService;
        this.projectsService = projectsService;
        this.notificationsService = notificationsService;
    }
    async findAll(query, role, adminId, participantId) {
        const { page = 1, limit = 15, status, projectId, search } = query;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (status)
            where.status = status;
        if (projectId)
            where.projectId = projectId;
        if (role === client_1.AdminRole.financial_officer && adminId) {
            where.project = { financialOfficerId: adminId };
        }
        if (role === 'participant' && participantId) {
            where.participantId = participantId;
        }
        if (query.participantId && role !== 'participant') {
            where.participantId = query.participantId;
        }
        const [data, total] = await Promise.all([
            this.prisma.projectDonation.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    project: {
                        include: { block: { include: { translations: true } } },
                    },
                    participant: {
                        include: { user: { select: { email: true, avatar: true } } },
                    },
                    approver: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            this.prisma.projectDonation.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async findById(id) {
        const donation = await this.prisma.projectDonation.findUnique({
            where: { id },
            include: {
                project: {
                    include: { block: { include: { translations: true } } },
                },
                participant: {
                    include: { user: { select: { email: true, avatar: true } } },
                },
                approver: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!donation)
            throw new common_1.NotFoundException(`Donation #${id} not found`);
        return donation;
    }
    async findByToken(token) {
        const donation = await this.prisma.projectDonation.findUnique({
            where: { qrToken: token },
            include: {
                project: {
                    include: { block: { include: { translations: true } } },
                },
                participant: {
                    include: { user: { select: { email: true, avatar: true } } },
                },
                approver: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!donation)
            throw new common_1.NotFoundException('Donation not found for this QR token');
        return donation;
    }
    async create(dto, participantId) {
        const project = await this.prisma.project.findUnique({
            where: { id: dto.projectId },
        });
        if (!project)
            throw new common_1.NotFoundException(`Project #${dto.projectId} not found`);
        if (project.isCompleted) {
            throw new common_1.BadRequestException('This project has reached its funding goal and is no longer accepting donations');
        }
        if (!project.isCompleted) {
            const blockActive = await this.prisma.block.findFirst({
                where: { id: project.blockId, isActive: true },
            });
            if (!blockActive)
                throw new common_1.BadRequestException('Project is not active');
        }
        const qrToken = this.qrService.generateToken();
        const donation = await this.prisma.projectDonation.create({
            data: {
                projectId: dto.projectId,
                participantId,
                amount: dto.amount,
                status: client_1.DonationStatus.pending,
                qrToken,
            },
            include: {
                project: { include: { block: { include: { translations: true } } } },
                participant: { include: { user: { select: { email: true } } } },
            },
        });
        const qrDataUrl = await this.qrService.generateQrDataUrl(qrToken);
        return { ...donation, qrDataUrl };
    }
    async updateStatus(id, dto, adminId, adminRole) {
        const donation = await this.findById(id);
        if (donation.status === client_1.DonationStatus.approved) {
            throw new common_1.BadRequestException('Approved donations cannot be modified');
        }
        if (donation.status === client_1.DonationStatus.cancelled) {
            throw new common_1.BadRequestException('Cancelled donations cannot be modified');
        }
        if (adminRole === client_1.AdminRole.financial_officer) {
            const project = await this.prisma.project.findUnique({ where: { id: donation.projectId } });
            if (project?.financialOfficerId !== adminId) {
                throw new common_1.ForbiddenException('You are not assigned to this project');
            }
        }
        const updateData = {
            status: dto.status,
            notes: dto.notes,
        };
        if (dto.status === client_1.DonationStatus.approved) {
            updateData.approvedBy = adminId;
            updateData.approvedAt = new Date();
        }
        const updated = await this.prisma.projectDonation.update({
            where: { id },
            data: updateData,
            include: {
                project: { include: { block: { include: { translations: true } } } },
                participant: { include: { user: { select: { email: true } } } },
            },
        });
        if (dto.status === client_1.DonationStatus.approved || dto.status === client_1.DonationStatus.rejected) {
            await this.projectsService.recalculateProgress(donation.projectId);
        }
        if (dto.status === client_1.DonationStatus.approved) {
            const project = await this.prisma.project.findUnique({ where: { id: donation.projectId } });
            if (project) {
                this.prisma.projectTransaction.create({
                    data: {
                        projectId: project.blockId,
                        type: 'income',
                        amount: donation.amount,
                        referenceType: 'donation',
                        referenceId: donation.id,
                    },
                }).catch(() => null);
            }
        }
        if (dto.status === client_1.DonationStatus.approved) {
            this.notificationsService
                .notify({ type: 'donation_cash_approved', donationId: updated.id })
                .catch(() => null);
        }
        const participantEmail = updated.participant.user?.email;
        const participantName = `${updated.participant.firstName} ${updated.participant.lastName}`;
        const projectName = updated.project.block.translations[0]?.name || 'Project';
        if (participantEmail) {
            if (dto.status === client_1.DonationStatus.approved) {
                await this.emailService.sendDonationApprovedEmail(participantEmail, participantName, projectName, Number(updated.amount), updated.id);
            }
            else if (dto.status === client_1.DonationStatus.rejected) {
                await this.emailService.sendDonationRejectedEmail(participantEmail, participantName, projectName, dto.notes);
            }
        }
        return updated;
    }
    async cancelDonation(id, participantId) {
        const donation = await this.findById(id);
        if (donation.participantId !== participantId) {
            throw new common_1.ForbiddenException('You can only cancel your own donations');
        }
        if (donation.status !== client_1.DonationStatus.pending) {
            throw new common_1.BadRequestException('Only pending donations can be cancelled');
        }
        return this.prisma.projectDonation.update({
            where: { id },
            data: { status: client_1.DonationStatus.cancelled },
        });
    }
    async getQrCode(token, format = 'dataurl') {
        const donation = await this.prisma.projectDonation.findUnique({ where: { qrToken: token } });
        if (!donation)
            throw new common_1.NotFoundException('Donation not found');
        if (format === 'buffer') {
            return this.qrService.generateQrBuffer(token);
        }
        return { qrDataUrl: await this.qrService.generateQrDataUrl(token) };
    }
};
exports.DonationsService = DonationsService;
exports.DonationsService = DonationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        qr_service_1.QrService,
        email_service_1.EmailService,
        projects_service_1.ProjectsService,
        notifications_service_1.NotificationsService])
], DonationsService);
//# sourceMappingURL=donations.service.js.map