import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VotingService } from './voting.service';
export declare class VotingScheduler {
    private readonly votingService;
    private readonly prisma;
    private readonly notificationsService;
    constructor(votingService: VotingService, prisma: PrismaService, notificationsService: NotificationsService);
    handleExpiredVotings(): Promise<void>;
    sendVotingReminders(): Promise<void>;
}
