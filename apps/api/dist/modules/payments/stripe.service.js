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
var StripeService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const StripeSDK = require('stripe');
let StripeService = StripeService_1 = class StripeService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(StripeService_1.name);
        const key = config.get('stripe.secretKey', '');
        if (key && !key.startsWith('sk_test_placeholder')) {
            this.stripe = new StripeSDK(key, { apiVersion: '2024-04-10' });
        }
        else {
            this.logger.warn('Stripe is not configured — payment features disabled');
        }
    }
    get client() {
        if (!this.stripe)
            throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
        return this.stripe;
    }
    async createCheckoutSession(params) {
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
    async constructWebhookEvent(payload, signature) {
        const webhookSecret = this.config.get('stripe.webhookSecret', '');
        return this.client.webhooks.constructEventAsync(payload, signature, webhookSecret);
    }
    async retrieveSession(sessionId) {
        return this.client.checkout.sessions.retrieve(sessionId);
    }
};
exports.StripeService = StripeService;
exports.StripeService = StripeService = StripeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], StripeService);
//# sourceMappingURL=stripe.service.js.map