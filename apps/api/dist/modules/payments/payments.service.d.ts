import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { PayPalService } from './paypal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentFiltersDto } from './dto/payment-filters.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class PaymentsService {
    private prisma;
    private stripeService;
    private paypalService;
    private config;
    private notificationsService;
    private readonly logger;
    constructor(prisma: PrismaService, stripeService: StripeService, paypalService: PayPalService, config: ConfigService, notificationsService: NotificationsService);
    createCheckout(dto: CreateCheckoutDto, participantId: number): Promise<{
        checkoutUrl: any;
        donationId: any;
    }>;
    handleStripeWebhook(payload: Buffer, signature: string): Promise<{
        received: boolean;
    }>;
    handlePayPalWebhook(headers: Record<string, string>, body: string): Promise<{
        received: boolean;
    }>;
    getDonationStatus(donationId: number, user: JwtPayload): Promise<any>;
    listOnlineDonations(filters: PaymentFiltersDto, user: JwtPayload): Promise<{
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
    updateProjectProgressionOnline(projectId: number): Promise<void>;
    private completeDonationBySession;
    private failDonationBySession;
    private logWebhook;
    private markWebhookProcessed;
}
