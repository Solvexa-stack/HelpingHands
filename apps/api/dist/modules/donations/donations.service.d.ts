import { PrismaService } from '../../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { EmailService } from '../email/email.service';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDonationDto, UpdateDonationStatusDto, DonationQueryDto } from './dto/donation.dto';
export declare class DonationsService {
    private prisma;
    private qrService;
    private emailService;
    private projectsService;
    private notificationsService;
    constructor(prisma: PrismaService, qrService: QrService, emailService: EmailService, projectsService: ProjectsService, notificationsService: NotificationsService);
    findAll(query: DonationQueryDto, role?: string, adminId?: number, participantId?: number): Promise<{
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
    findById(id: number): Promise<any>;
    findByToken(token: string): Promise<any>;
    create(dto: CreateDonationDto, participantId: number): Promise<any>;
    updateStatus(id: number, dto: UpdateDonationStatusDto, adminId: number, adminRole: string): Promise<any>;
    cancelDonation(id: number, participantId: number): Promise<any>;
    getQrCode(token: string, format?: 'dataurl' | 'buffer'): Promise<any>;
}
