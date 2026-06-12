import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const paypal = require('@paypal/checkout-server-sdk');

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);
  private client: any;
  private clientId: string;
  private clientSecret: string;
  private mode: string;

  constructor(private config: ConfigService) {
    this.clientId = config.get<string>('paypal.clientId', '');
    this.clientSecret = config.get<string>('paypal.clientSecret', '');
    this.mode = config.get<string>('paypal.mode', 'sandbox');

    const environment =
      this.mode === 'live'
        ? new paypal.core.LiveEnvironment(this.clientId, this.clientSecret)
        : new paypal.core.SandboxEnvironment(this.clientId, this.clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createOrder(params: {
    projectId: number;
    amount: number;
    currency: string;
    description: string;
  }): Promise<{ id: string; approvalUrl: string }> {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: params.currency,
            value: (params.amount / 100).toFixed(2),
          },
          description: params.description,
          custom_id: String(params.projectId),
        },
      ],
    });

    const order = await this.client.execute(request);
    const approvalUrl: string =
      order.result.links.find((l: any) => l.rel === 'approve')?.href ?? '';

    return { id: order.result.id, approvalUrl };
  }

  async captureOrder(orderId: string): Promise<{ status: string; paymentId: string }> {
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await this.client.execute(request);
    const paymentId: string =
      capture.result.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? '';

    return { status: capture.result.status, paymentId };
  }

  async verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean> {
    try {
      const baseUrl =
        this.mode === 'live'
          ? 'https://api-m.paypal.com'
          : 'https://api-m.sandbox.paypal.com';

      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      });
      const tokenData = (await tokenRes.json()) as { access_token: string };

      const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify({
          transmission_id: headers['paypal-transmission-id'],
          transmission_time: headers['paypal-transmission-time'],
          cert_url: headers['paypal-cert-url'],
          auth_algo: headers['paypal-auth-algo'],
          transmission_sig: headers['paypal-transmission-sig'],
          webhook_id: this.config.get<string>('paypal.webhookId', ''),
          webhook_event: JSON.parse(body),
        }),
      });

      const verifyData = (await verifyRes.json()) as { verification_status: string };
      return verifyData.verification_status === 'SUCCESS';
    } catch (err) {
      this.logger.error('PayPal webhook verification failed', err);
      return false;
    }
  }
}
