import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEvent } from './notification-event.type';
export declare class NotificationsService {
    private prisma;
    private notifQueue;
    private emailQueue;
    constructor(prisma: PrismaService, notifQueue: Queue, emailQueue: Queue);
    notify(event: NotificationEvent): Promise<void>;
    getMyNotifications(userId: number, page?: number): Promise<{
        data: unknown[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }>;
    markRead(notificationId: number, userId: number): Promise<void>;
    markAllRead(userId: number): Promise<void>;
    getUnreadCount(userId: number): Promise<number>;
    dispatchEmailJob(jobName: string, payload: Record<string, unknown>): Promise<void>;
    createNotificationRecord(data: {
        userId: number;
        type: string;
        title: string;
        body: string;
        referenceId?: number;
        referenceType?: string;
    }): Promise<void>;
}
