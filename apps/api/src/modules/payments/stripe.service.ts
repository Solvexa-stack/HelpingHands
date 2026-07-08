import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

@Injectable()
export class StripeService {
  private stripe: any;
  private readonly logger = new Logger(StripeService.name);

  constructor(private config: ConfigService) {
    const key = config.get<string>('stripe.secretKey', '');
    if (key && !key.startsWith('sk_test_placeholder')) {
      this.stripe = new StripeSDK(key, { apiVersion: '2024-04-10' });
    } else {
      this.logger.warn('Stripe is not configured — payment features disabled');
    }
  }

  private get client(): any {
    if (!this.stripe) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
    return this.stripe;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createCheckoutSession(params: {
    projectId: number;
    projectName: string;
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<any> {
    return this.client.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency,
            product_data: { name: params.projectName },
            unit_amount: params.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });
  }

  async constructWebhookEvent(payload: Buffer, signature: string): Promise<any> {
    const webhookSecret = this.config.get<string>('stripe.webhookSecret', '');
    return this.client.webhooks.constructEventAsync(payload, signature, webhookSecret);
  }

  async retrieveSession(sessionId: string): Promise<any> {
    return this.client.checkout.sessions.retrieve(sessionId);
  }
}
