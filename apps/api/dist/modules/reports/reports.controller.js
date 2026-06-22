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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const express_1 = require("express");
const reports_service_1 = require("./reports.service");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let ReportsController = class ReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    async pdfSummary(id, res) {
        const buffer = await this.reportsService.generateProjectSummaryPdf(id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-summary.pdf"` });
        res.send(buffer);
    }
    async pdfFinancial(id, res) {
        const buffer = await this.reportsService.generateFinancialPdf(id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-financial.pdf"` });
        res.send(buffer);
    }
    async pdfProgress(id, res) {
        const buffer = await this.reportsService.generateProgressPdf(id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-progress.pdf"` });
        res.send(buffer);
    }
    async excelFinancial(id, res) {
        const buffer = await this.reportsService.generateFinancialExcel(id);
        res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-financial.xlsx"` });
        res.send(buffer);
    }
    async excelDonations(id, res) {
        const buffer = await this.reportsService.generateDonationsExcel(id);
        res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-donations.xlsx"` });
        res.send(buffer);
    }
    async excelExpenses(id, res) {
        const buffer = await this.reportsService.generateExpensesExcel(id);
        res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-expenses.xlsx"` });
        res.send(buffer);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('projects/:id/pdf/summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Download project summary PDF' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "pdfSummary", null);
__decorate([
    (0, common_1.Get)('projects/:id/pdf/financial'),
    (0, swagger_1.ApiOperation)({ summary: 'Download financial report PDF' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "pdfFinancial", null);
__decorate([
    (0, common_1.Get)('projects/:id/pdf/progress'),
    (0, swagger_1.ApiOperation)({ summary: 'Download progress report PDF' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "pdfProgress", null);
__decorate([
    (0, common_1.Get)('projects/:id/excel/financial'),
    (0, swagger_1.ApiOperation)({ summary: 'Download financial Excel report' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "excelFinancial", null);
__decorate([
    (0, common_1.Get)('projects/:id/excel/donations'),
    (0, swagger_1.ApiOperation)({ summary: 'Download donations Excel report' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_e = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "excelDonations", null);
__decorate([
    (0, common_1.Get)('projects/:id/excel/expenses'),
    (0, swagger_1.ApiOperation)({ summary: 'Download expenses Excel report' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_f = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "excelExpenses", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('Reports'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.financial_officer),
    (0, common_1.Controller)({ path: 'reports', version: '1' }),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map