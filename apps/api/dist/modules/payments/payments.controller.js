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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const payments_service_1 = require("./payments.service");
const create_checkout_dto_1 = require("./dto/create-checkout.dto");
const payment_filters_dto_1 = require("./dto/payment-filters.dto");
let PaymentsController = class PaymentsController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    createCheckout(dto, participantId) {
        return this.paymentsService.createCheckout(dto, participantId);
    }
    getDonationStatus(id, user) {
        return this.paymentsService.getDonationStatus(id, user);
    }
    listDonations(filters, user) {
        return this.paymentsService.listOnlineDonations(filters, user);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)('checkout'),
    (0, roles_decorator_1.Roles)('participant'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a Stripe or PayPal checkout for a project donation' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('referenceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_checkout_dto_1.CreateCheckoutDto, Number]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "createCheckout", null);
__decorate([
    (0, common_1.Get)('donations/:id/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the status of an online donation' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "getDonationStatus", null);
__decorate([
    (0, common_1.Get)('donations'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, 'participant'),
    (0, swagger_1.ApiOperation)({ summary: 'List online donations (admin sees all, participant sees own)' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_filters_dto_1.PaymentFiltersDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "listDonations", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.Controller)({ path: 'payments', version: '1' }),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map