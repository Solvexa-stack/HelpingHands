import { ConfigService } from '@nestjs/config';
export declare class StripeService {
    private config;
    private stripe;
    private readonly logger;
    constructor(config: ConfigService);
    private get client();
    createCheckoutSession(params: {
        projectId: number;
        projectName: string;
        amount: number;
        currency: string;
        successUrl: string;
        cancelUrl: string;
        metadata: Record<string, string>;
    }): Promise<any>;
    constructWebhookEvent(payload: Buffer, signature: string): Promise<any>;
    retrieveSession(sessionId: string): Promise<any>;
}
