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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonationQueryDto = exports.UpdateDonationStatusDto = exports.CreateDonationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
class CreateDonationDto {
}
exports.CreateDonationDto = CreateDonationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Project ID' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateDonationDto.prototype, "projectId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 500 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDonationDto.prototype, "amount", void 0);
class UpdateDonationStatusDto {
}
exports.UpdateDonationStatusDto = UpdateDonationStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [client_1.DonationStatus.approved, client_1.DonationStatus.rejected, client_1.DonationStatus.cancelled] }),
    (0, class_validator_1.IsEnum)(client_1.DonationStatus),
    __metadata("design:type", typeof (_a = typeof client_1.DonationStatus !== "undefined" && client_1.DonationStatus) === "function" ? _a : Object)
], UpdateDonationStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Payment verified in person' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDonationStatusDto.prototype, "notes", void 0);
class DonationQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 15;
    }
}
exports.DonationQueryDto = DonationQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.DonationStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.DonationStatus),
    __metadata("design:type", typeof (_b = typeof client_1.DonationStatus !== "undefined" && client_1.DonationStatus) === "function" ? _b : Object)
], DonationQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DonationQueryDto.prototype, "projectId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DonationQueryDto.prototype, "participantId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], DonationQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 15 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], DonationQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DonationQueryDto.prototype, "search", void 0);
//# sourceMappingURL=donation.dto.js.map