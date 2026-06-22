import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
export declare class WebhooksController {
    private paymentsService;
    constructor(paymentsService: PaymentsService);
    handleStripe(req: RawBodyRequest<Request>, signature: string): Promise<{
        received: boolean;
    }>;
    handlePayPal(req: Request, headers: Record<string, string>): Promise<{
        received: boolean;
    }>;
}
