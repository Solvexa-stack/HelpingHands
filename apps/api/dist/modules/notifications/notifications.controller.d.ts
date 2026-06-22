import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
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
    getUnreadCount(userId: number): Promise<{
        count: number;
    }>;
    markRead(id: number, userId: number): Promise<void>;
    markAllRead(userId: number): Promise<void>;
}
