import { ConfigService } from '@nestjs/config';
export declare class PayPalService {
    private config;
    private readonly logger;
    private client;
    private clientId;
    private clientSecret;
    private mode;
    constructor(config: ConfigService);
    createOrder(params: {
        projectId: number;
        amount: number;
        currency: string;
        description: string;
    }): Promise<{
        id: string;
        approvalUrl: string;
    }>;
    captureOrder(orderId: string): Promise<{
        status: string;
        paymentId: string;
    }>;
    verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>;
}
