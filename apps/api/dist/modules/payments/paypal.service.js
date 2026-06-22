"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PayPalService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayPalService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const paypal = require('@paypal/checkout-server-sdk');
let PayPalService = PayPalService_1 = class PayPalService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(PayPalService_1.name);
        this.clientId = config.get('paypal.clientId', '');
        this.clientSecret = config.get('paypal.clientSecret', '');
        this.mode = config.get('paypal.mode', 'sandbox');
        const environment = this.mode === 'live'
            ? new paypal.core.LiveEnvironment(this.clientId, this.clientSecret)
            : new paypal.core.SandboxEnvironment(this.clientId, this.clientSecret);
        this.client = new paypal.core.PayPalHttpClient(environment);
    }
    async createOrder(params) {
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
        const approvalUrl = order.result.links.find((l) => l.rel === 'approve')?.href ?? '';
        return { id: order.result.id, approvalUrl };
    }
    async captureOrder(orderId) {
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        const capture = await this.client.execute(request);
        const paymentId = capture.result.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? '';
        return { status: capture.result.status, paymentId };
    }
    async verifyWebhook(headers, body) {
        try {
            const baseUrl = this.mode === 'live'
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
            const tokenData = (await tokenRes.json());
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
                    webhook_id: this.config.get('paypal.webhookId', ''),
                    webhook_event: JSON.parse(body),
                }),
            });
            const verifyData = (await verifyRes.json());
            return verifyData.verification_status === 'SUCCESS';
        }
        catch (err) {
            this.logger.error('PayPal webhook verification failed', err);
            return false;
        }
    }
};
exports.PayPalService = PayPalService;
exports.PayPalService = PayPalService = PayPalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], PayPalService);
//# sourceMappingURL=paypal.service.js.map