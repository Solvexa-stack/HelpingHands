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
exports.FinancialController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const financial_service_1 = require("./financial.service");
const financial_dto_1 = require("./dto/financial.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let FinancialController = class FinancialController {
    constructor(financialService) {
        this.financialService = financialService;
    }
    findBudgets(projectId) {
        return this.financialService.findBudgets(projectId);
    }
    createBudget(projectId, dto) {
        return this.financialService.createBudget(projectId, dto);
    }
    updateBudget(projectId, id, dto) {
        return this.financialService.updateBudget(projectId, id, dto);
    }
    removeBudget(projectId, id) {
        return this.financialService.removeBudget(projectId, id);
    }
    findExpenses(projectId, budgetId, status) {
        return this.financialService.findExpenses(projectId, budgetId ? +budgetId : undefined, status);
    }
    createExpense(projectId, dto) {
        return this.financialService.createExpense(projectId, dto);
    }
    updateExpense(projectId, id, dto) {
        return this.financialService.updateExpense(projectId, id, dto);
    }
    updateExpenseStatus(projectId, id, dto) {
        return this.financialService.updateExpenseStatus(projectId, id, dto);
    }
    removeExpense(projectId, id) {
        return this.financialService.removeExpense(projectId, id);
    }
    findTransactions(projectId) {
        return this.financialService.findTransactions(projectId);
    }
    createTransaction(projectId, dto) {
        return this.financialService.createTransaction(projectId, dto);
    }
    getSummary(projectId) {
        return this.financialService.getSummary(projectId);
    }
};
exports.FinancialController = FinancialController;
__decorate([
    (0, common_1.Get)('budgets'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'List budgets' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "findBudgets", null);
__decorate([
    (0, common_1.Post)('budgets'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'Create a budget' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, financial_dto_1.CreateBudgetDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "createBudget", null);
__decorate([
    (0, common_1.Patch)('budgets/:id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'Update a budget' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, financial_dto_1.UpdateBudgetDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "updateBudget", null);
__decorate([
    (0, common_1.Delete)('budgets/:id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a budget' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "removeBudget", null);
__decorate([
    (0, common_1.Get)('expenses'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'List expenses' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('budgetId')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, typeof (_a = typeof client_1.ExpenseStatus !== "undefined" && client_1.ExpenseStatus) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "findExpenses", null);
__decorate([
    (0, common_1.Post)('expenses'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiOperation)({ summary: 'Create an expense' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, financial_dto_1.CreateExpenseDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "createExpense", null);
__decorate([
    (0, common_1.Patch)('expenses/:id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiOperation)({ summary: 'Update an expense' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, financial_dto_1.UpdateExpenseDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "updateExpense", null);
__decorate([
    (0, common_1.Patch)('expenses/:id/status'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'Approve or reject an expense' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, financial_dto_1.UpdateExpenseStatusDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "updateExpenseStatus", null);
__decorate([
    (0, common_1.Delete)('expenses/:id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiOperation)({ summary: 'Delete an expense' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "removeExpense", null);
__decorate([
    (0, common_1.Get)('transactions'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'List transaction ledger' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "findTransactions", null);
__decorate([
    (0, common_1.Post)('transactions'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'Create manual transaction (adjustment/refund)' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, financial_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "createTransaction", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiOperation)({ summary: 'Get financial summary for project' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], FinancialController.prototype, "getSummary", null);
exports.FinancialController = FinancialController = __decorate([
    (0, swagger_1.ApiTags)('Financial'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.Controller)({ path: 'projects/:projectId/financial', version: '1' }),
    __metadata("design:paramtypes", [financial_service_1.FinancialService])
], FinancialController);
//# sourceMappingURL=financial.controller.js.map