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
exports.CreateTransactionDto = exports.UpdateExpenseStatusDto = exports.UpdateExpenseDto = exports.CreateExpenseDto = exports.UpdateBudgetDto = exports.CreateBudgetDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateBudgetDto {
}
exports.CreateBudgetDto = CreateBudgetDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateBudgetDto.prototype, "blockId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateBudgetDto.prototype, "estimatedAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateBudgetDto.prototype, "approvedAmount", void 0);
class UpdateBudgetDto extends (0, swagger_1.PartialType)(CreateBudgetDto) {
}
exports.UpdateBudgetDto = UpdateBudgetDto;
class CreateExpenseDto {
}
exports.CreateExpenseDto = CreateExpenseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "blockId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "budgetId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "invoiceRef", void 0);
class UpdateExpenseDto extends (0, swagger_1.PartialType)(CreateExpenseDto) {
}
exports.UpdateExpenseDto = UpdateExpenseDto;
class UpdateExpenseStatusDto {
}
exports.UpdateExpenseStatusDto = UpdateExpenseStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [client_1.ExpenseStatus.approved, client_1.ExpenseStatus.rejected] }),
    (0, class_validator_1.IsEnum)(client_1.ExpenseStatus),
    __metadata("design:type", typeof (_a = typeof client_1.ExpenseStatus !== "undefined" && client_1.ExpenseStatus) === "function" ? _a : Object)
], UpdateExpenseStatusDto.prototype, "status", void 0);
class CreateTransactionDto {
}
exports.CreateTransactionDto = CreateTransactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.TransactionType }),
    (0, class_validator_1.IsEnum)(client_1.TransactionType),
    __metadata("design:type", typeof (_b = typeof client_1.TransactionType !== "undefined" && client_1.TransactionType) === "function" ? _b : Object)
], CreateTransactionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "notes", void 0);
//# sourceMappingURL=financial.dto.js.map