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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const bull_2 = require("bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let NotificationsService = class NotificationsService {
    constructor(prisma, notifQueue, emailQueue) {
        this.prisma = prisma;
        this.notifQueue = notifQueue;
        this.emailQueue = emailQueue;
    }
    async notify(event) {
        await this.notifQueue.add('handle_event', event, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
        });
    }
    async getMyNotifications(userId, page = 1) {
        const limit = 20;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const [data, total] = await Promise.all([
            this.prisma.notification.findMany({
                where: { userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.notification.count({ where: { userId } }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async markRead(notificationId, userId) {
        const notif = await this.prisma.notification.findUnique({
            where: { id: notificationId },
        });
        if (!notif)
            throw new common_1.NotFoundException(`Notification #${notificationId} not found`);
        if (notif.userId !== userId)
            throw new common_1.NotFoundException(`Notification #${notificationId} not found`);
        await this.prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true, readAt: new Date() },
        });
    }
    async markAllRead(userId) {
        await this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });
    }
    async getUnreadCount(userId) {
        return this.prisma.notification.count({ where: { userId, isRead: false } });
    }
    async dispatchEmailJob(jobName, payload) {
        await this.emailQueue.add(jobName, payload, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
        });
    }
    async createNotificationRecord(data) {
        await this.prisma.notification.create({ data });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('notifications')),
    __param(2, (0, bull_1.InjectQueue)('email')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof bull_2.Queue !== "undefined" && bull_2.Queue) === "function" ? _a : Object, typeof (_b = typeof bull_2.Queue !== "undefined" && bull_2.Queue) === "function" ? _b : Object])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map