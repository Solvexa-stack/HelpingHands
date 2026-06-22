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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const express_1 = require("express");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const payments_service_1 = require("./payments.service");
let WebhooksController = class WebhooksController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    async handleStripe(req, signature) {
        if (!signature)
            throw new common_1.ForbiddenException('Missing stripe-signature header');
        const rawBody = req.rawBody;
        if (!rawBody)
            throw new common_1.ForbiddenException('Missing raw body');
        return this.paymentsService.handleStripeWebhook(rawBody, signature);
    }
    async handlePayPal(req, headers) {
        const body = JSON.stringify(req.body);
        return this.paymentsService.handlePayPalWebhook(headers, body);
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, common_1.Post)('stripe'),
    (0, roles_decorator_1.Public)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('stripe-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.RawBodyRequest !== "undefined" && common_1.RawBodyRequest) === "function" ? _a : Object, String]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "handleStripe", null);
__decorate([
    (0, common_1.Post)('paypal'),
    (0, roles_decorator_1.Public)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "handlePayPal", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, swagger_1.ApiTags)('Webhooks'),
    (0, common_1.Controller)({ path: 'webhooks', version: '1' }),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map