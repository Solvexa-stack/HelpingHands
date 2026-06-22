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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const express_1 = require("express");
const client_1 = require("@prisma/client");
const donations_service_1 = require("./donations.service");
const donation_dto_1 = require("./dto/donation.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let DonationsController = class DonationsController {
    constructor(donationsService) {
        this.donationsService = donationsService;
    }
    findAll(query, user) {
        return this.donationsService.findAll(query, user.role, user.referenceId, user.referenceId);
    }
    findOne(id) {
        return this.donationsService.findById(id);
    }
    findByToken(token) {
        return this.donationsService.findByToken(token);
    }
    async getQr(token) {
        return this.donationsService.getQrCode(token, 'dataurl');
    }
    async downloadQr(token, res) {
        const buffer = await this.donationsService.getQrCode(token, 'buffer');
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="qr-${token}.png"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    }
    create(dto, user) {
        return this.donationsService.create(dto, user.referenceId);
    }
    updateStatus(id, dto, user) {
        return this.donationsService.updateStatus(id, dto, user.referenceId, user.role);
    }
    cancel(id, user) {
        return this.donationsService.cancelDonation(id, user.referenceId);
    }
};
exports.DonationsController = DonationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List donations (filtered by role)' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [donation_dto_1.DonationQueryDto, Object]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Get donation by ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)('token/:token'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify donation by QR token' }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "findByToken", null);
__decorate([
    (0, common_1.Get)(':token/qr'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Get QR code data URL for a donation' }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DonationsController.prototype, "getQr", null);
__decorate([
    (0, common_1.Get)(':token/qr/download'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Download QR code as PNG image' }),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], DonationsController.prototype, "downloadQr", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('participant'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new donation request (participant only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [donation_dto_1.CreateDonationDto, Object]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Update donation status (approve/reject)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, donation_dto_1.UpdateDonationStatusDto, Object]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, roles_decorator_1.Roles)('participant'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a pending donation (participant only)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", void 0)
], DonationsController.prototype, "cancel", null);
exports.DonationsController = DonationsController = __decorate([
    (0, swagger_1.ApiTags)('Donations'),
    (0, common_1.Controller)({ path: 'donations', version: '1' }),
    __metadata("design:paramtypes", [donations_service_1.DonationsService])
], DonationsController);
//# sourceMappingURL=donations.controller.js.map