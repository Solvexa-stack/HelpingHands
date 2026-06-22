import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentFiltersDto } from './dto/payment-filters.dto';
export declare class PaymentsController {
    private paymentsService;
    constructor(paymentsService: PaymentsService);
    createCheckout(dto: CreateCheckoutDto, participantId: number): Promise<{
        checkoutUrl: any;
        donationId: any;
    }>;
    getDonationStatus(id: number, user: JwtPayload): Promise<any>;
    listDonations(filters: PaymentFiltersDto, user: JwtPayload): Promise<{
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
}
