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
var NotificationsProcessor_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bull_2 = require("bull");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const notifications_service_1 = require("./notifications.service");
let NotificationsProcessor = NotificationsProcessor_1 = class NotificationsProcessor {
    constructor(prisma, notificationsService, config) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.config = config;
        this.logger = new common_1.Logger(NotificationsProcessor_1.name);
    }
    async handleEvent(job) {
        const event = job.data;
        try {
            await this.dispatch(event);
        }
        catch (err) {
            this.logger.error(`Failed to handle notification event ${event.type}`, err);
            throw err;
        }
    }
    webUrl() {
        return this.config.get('app.webUrl', 'http://localhost:3000');
    }
    async dispatch(event) {
        switch (event.type) {
            case 'study_published':
                return this.handleStudyPublished(event.studyId, event.projectId);
            case 'voting_open':
                return this.handleVotingOpen(event.studyId, event.projectId);
            case 'voting_reminder':
                return this.handleVotingReminder(event.studyId);
            case 'study_approved':
                return this.handleStudyApproved(event.studyId, event.projectId);
            case 'study_rejected':
                return this.handleStudyRejected(event.studyId, event.adminId, event.reason);
            case 'donation_online_confirmed':
                return this.handleOnlineDonationConfirmed(event.donationId);
            case 'donation_cash_approved':
                return this.handleCashDonationApproved(event.donationId);
        }
    }
    async handleStudyPublished(studyId, projectId) {
        const [study, project] = await Promise.all([
            this.prisma.projectStudy.findUnique({ where: { id: studyId } }),
            this.prisma.project.findUnique({
                where: { id: projectId },
                include: { block: { include: { translations: true } } },
            }),
        ]);
        if (!study || !project)
            return;
        const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
        const studyUrl = `${this.webUrl()}/en/projects/${projectId}/study`;
        const donors = await this.prisma.projectDonation.findMany({
            where: { projectId, status: 'approved' },
            select: {
                participant: { include: { user: { select: { id: true, email: true } } } },
            },
            distinct: ['participantId'],
        });
        const seen = new Set();
        for (const d of donors) {
            const user = d.participant?.user;
            if (!user || seen.has(user.id))
                continue;
            seen.add(user.id);
            await this.notificationsService.createNotificationRecord({
                userId: user.id,
                type: 'study_published',
                title: `Study published: ${projectName}`,
                body: `The feasibility study for ${projectName} has been published and is ready for review.`,
                referenceId: studyId,
                referenceType: 'study',
            });
            await this.notificationsService.dispatchEmailJob('study_published', {
                to: user.email,
                participantName: `${d.participant.firstName} ${d.participant.lastName}`,
                projectName,
                studyUrl,
                votingStartsAt: study.votingStartsAt?.toLocaleDateString() ?? '',
            });
        }
    }
    async handleVotingOpen(studyId, projectId) {
        const [study, project] = await Promise.all([
            this.prisma.projectStudy.findUnique({ where: { id: studyId } }),
            this.prisma.project.findUnique({
                where: { id: projectId },
                include: { block: { include: { translations: true } } },
            }),
        ]);
        if (!study || !project)
            return;
        const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
        const voteUrl = `${this.webUrl()}/en/projects/${projectId}/vote`;
        const votingEndsAt = study.votingEndsAt?.toLocaleDateString() ?? 'TBD';
        const participants = await this.prisma.participant.findMany({
            include: { user: { select: { id: true, email: true } } },
        });
        for (const p of participants) {
            if (!p.user)
                continue;
            await this.notificationsService.createNotificationRecord({
                userId: p.user.id,
                type: 'voting_open',
                title: `Voting is now open: ${projectName}`,
                body: `Cast your vote for ${projectName} before ${votingEndsAt}.`,
                referenceId: studyId,
                referenceType: 'study',
            });
            await this.notificationsService.dispatchEmailJob('voting_open', {
                to: p.user.email,
                participantName: `${p.firstName} ${p.lastName}`,
                projectName,
                voteUrl,
                votingEndsAt,
            });
        }
    }
    async handleVotingReminder(studyId) {
        const study = await this.prisma.projectStudy.findUnique({
            where: { id: studyId },
            include: {
                project: { include: { block: { include: { translations: true } } } },
            },
        });
        if (!study)
            return;
        const projectName = study.project.block.translations[0]?.name ?? `Project #${study.projectId}`;
        const voteUrl = `${this.webUrl()}/en/projects/${study.projectId}/vote`;
        const hoursRemaining = study.votingEndsAt
            ? Math.max(0, Math.round((study.votingEndsAt.getTime() - Date.now()) / 3600000)).toString()
            : '24';
        const votedUserIds = await this.prisma.studyVote.findMany({
            where: { studyId },
            select: { userId: true },
        });
        const votedSet = new Set(votedUserIds.map((v) => v.userId));
        const participants = await this.prisma.participant.findMany({
            include: { user: { select: { id: true, email: true } } },
        });
        for (const p of participants) {
            if (!p.user || votedSet.has(p.user.id))
                continue;
            await this.notificationsService.createNotificationRecord({
                userId: p.user.id,
                type: 'voting_reminder',
                title: `Reminder: Vote for ${projectName} closes soon`,
                body: `Only ${hoursRemaining} hours left to vote on ${projectName}.`,
                referenceId: studyId,
                referenceType: 'study',
            });
            await this.notificationsService.dispatchEmailJob('voting_reminder', {
                to: p.user.email,
                participantName: `${p.firstName} ${p.lastName}`,
                projectName,
                voteUrl,
                hoursRemaining,
            });
        }
    }
    async handleStudyApproved(studyId, projectId) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            include: { block: { include: { translations: true } } },
        });
        if (!project)
            return;
        const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
        const donateUrl = `${this.webUrl()}/en/projects/${projectId}`;
        const [voters, donors] = await Promise.all([
            this.prisma.studyVote.findMany({
                where: { studyId },
                include: {
                    user: {
                        select: { id: true, email: true, participantId: true },
                        include: { participant: { select: { firstName: true, lastName: true } } },
                    },
                },
            }),
            this.prisma.projectDonation.findMany({
                where: { projectId, status: 'approved' },
                select: {
                    participant: { include: { user: { select: { id: true, email: true } } } },
                },
                distinct: ['participantId'],
            }),
        ]);
        const seen = new Set();
        const notify = async (userId, email, name) => {
            if (seen.has(userId))
                return;
            seen.add(userId);
            await this.notificationsService.createNotificationRecord({
                userId,
                type: 'study_approved',
                title: `${projectName} has been approved!`,
                body: `Great news! ${projectName} passed the vote and is now open for donations.`,
                referenceId: projectId,
                referenceType: 'project',
            });
            await this.notificationsService.dispatchEmailJob('study_approved', {
                to: email,
                participantName: name,
                projectName,
                donateUrl,
            });
        };
        for (const v of voters) {
            if (!v.user?.email)
                continue;
            const name = v.user.participant
                ? `${v.user.participant.firstName} ${v.user.participant.lastName}`
                : 'Participant';
            await notify(v.user.id, v.user.email, name);
        }
        for (const d of donors) {
            const user = d.participant?.user;
            if (!user?.email)
                continue;
            const name = `${d.participant.firstName} ${d.participant.lastName}`;
            await notify(user.id, user.email, name);
        }
    }
    async handleStudyRejected(studyId, adminId, reason) {
        const [study, admin] = await Promise.all([
            this.prisma.projectStudy.findUnique({
                where: { id: studyId },
                include: { project: { include: { block: { include: { translations: true } } } } },
            }),
            this.prisma.admin.findUnique({
                where: { id: adminId },
                include: { user: { select: { id: true, email: true } } },
            }),
        ]);
        if (!study || !admin?.user)
            return;
        const projectName = study.project.block.translations[0]?.name ?? `Project #${study.projectId}`;
        const adminName = `${admin.firstName} ${admin.lastName}`;
        await this.notificationsService.createNotificationRecord({
            userId: admin.user.id,
            type: 'study_rejected',
            title: `Study rejected: ${projectName}`,
            body: `The study for ${projectName} was rejected. Reason: ${reason}`,
            referenceId: studyId,
            referenceType: 'study',
        });
        await this.notificationsService.dispatchEmailJob('study_rejected', {
            to: admin.user.email,
            adminName,
            projectName,
            reason,
        });
    }
    async handleOnlineDonationConfirmed(donationId) {
        const donation = await this.prisma.onlineDonation.findUnique({
            where: { id: donationId },
            include: {
                project: { include: { block: { include: { translations: true } } } },
                participant: { include: { user: { select: { id: true, email: true } } } },
            },
        });
        if (!donation?.participant?.user)
            return;
        const projectName = donation.project.block.translations[0]?.name ?? `Project #${donation.projectId}`;
        const user = donation.participant.user;
        const name = `${donation.participant.firstName} ${donation.participant.lastName}`;
        await this.notificationsService.createNotificationRecord({
            userId: user.id,
            type: 'donation_online_confirmed',
            title: `Donation confirmed for ${projectName}`,
            body: `Your online donation of ${donation.amount} ${donation.currency} to ${projectName} was confirmed.`,
            referenceId: donationId,
            referenceType: 'online_donation',
        });
        await this.notificationsService.dispatchEmailJob('donation_online_confirmed', {
            to: user.email,
            participantName: name,
            amount: String(donation.amount),
            currency: donation.currency,
            projectName,
            transactionId: donation.providerPaymentId ?? donation.providerSessionId,
            date: (donation.paidAt ?? donation.createdAt).toLocaleDateString(),
        });
    }
    async handleCashDonationApproved(donationId) {
        const donation = await this.prisma.projectDonation.findUnique({
            where: { id: donationId },
            include: {
                project: { include: { block: { include: { translations: true } } } },
                participant: { include: { user: { select: { id: true, email: true } } } },
            },
        });
        if (!donation?.participant?.user)
            return;
        const projectName = donation.project.block.translations[0]?.name ?? `Project #${donation.projectId}`;
        const user = donation.participant.user;
        const name = `${donation.participant.firstName} ${donation.participant.lastName}`;
        await this.notificationsService.createNotificationRecord({
            userId: user.id,
            type: 'donation_cash_approved',
            title: `Cash donation approved for ${projectName}`,
            body: `Your donation of $${Number(donation.amount).toLocaleString()} to ${projectName} has been approved.`,
            referenceId: donationId,
            referenceType: 'donation',
        });
        await this.notificationsService.dispatchEmailJob('donation_cash_approved', {
            to: user.email,
            participantName: name,
            projectName,
            amount: Number(donation.amount),
            donationId,
        });
    }
};
exports.NotificationsProcessor = NotificationsProcessor;
__decorate([
    (0, bull_1.Process)('handle_event'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], NotificationsProcessor.prototype, "handleEvent", null);
exports.NotificationsProcessor = NotificationsProcessor = NotificationsProcessor_1 = __decorate([
    (0, bull_1.Processor)('notifications'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], NotificationsProcessor);
//# sourceMappingURL=notifications.processor.js.map