import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationEvent } from './notification-event.type';
export declare class NotificationsProcessor {
    private prisma;
    private notificationsService;
    private config;
    private readonly logger;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, config: ConfigService);
    handleEvent(job: Job<NotificationEvent>): Promise<void>;
    private webUrl;
    private dispatch;
    private handleStudyPublished;
    private handleVotingOpen;
    private handleVotingReminder;
    private handleStudyApproved;
    private handleStudyRejected;
    private handleOnlineDonationConfirmed;
    private handleCashDonationApproved;
}
