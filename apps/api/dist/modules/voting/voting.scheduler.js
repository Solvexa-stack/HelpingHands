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
exports.VotingScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const voting_service_1 = require("./voting.service");
const client_1 = require("@prisma/client");
let VotingScheduler = class VotingScheduler {
    constructor(votingService, prisma, notificationsService) {
        this.votingService = votingService;
        this.prisma = prisma;
        this.notificationsService = notificationsService;
    }
    async handleExpiredVotings() {
        await this.votingService.autoCloseExpiredVotings();
    }
    async sendVotingReminders() {
        const now = new Date();
        const windowStart = new Date(now.getTime() + 23 * 3600000);
        const windowEnd = new Date(now.getTime() + 25 * 3600000);
        const studies = await this.prisma.projectStudy.findMany({
            where: {
                status: client_1.StudyStatus.voting_open,
                votingEndsAt: { gte: windowStart, lte: windowEnd },
                reminderSentAt: null,
            },
        });
        for (const study of studies) {
            await this.notificationsService
                .notify({ type: 'voting_reminder', studyId: study.id })
                .catch(() => null);
            await this.prisma.projectStudy.update({
                where: { id: study.id },
                data: { reminderSentAt: new Date() },
            });
        }
    }
};
exports.VotingScheduler = VotingScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VotingScheduler.prototype, "handleExpiredVotings", null);
__decorate([
    (0, schedule_1.Cron)('0 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VotingScheduler.prototype, "sendVotingReminders", null);
exports.VotingScheduler = VotingScheduler = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [voting_service_1.VotingService,
        prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService])
], VotingScheduler);
//# sourceMappingURL=voting.scheduler.js.map