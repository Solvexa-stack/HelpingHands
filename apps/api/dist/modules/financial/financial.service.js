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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let FinancialService = class FinancialService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProjectBlockId(projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException(`Project #${projectId} not found`);
        return project.blockId;
    }
    async assertBlockExists(blockId) {
        const block = await this.prisma.block.findUnique({ where: { id: blockId } });
        if (!block)
            throw new common_1.NotFoundException(`Block #${blockId} not found`);
    }
    async findBudgets(projectId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        return this.prisma.projectBudget.findMany({
            where: { projectId: projectBlockId },
            include: {
                block: { include: { translations: true } },
                expenses: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async createBudget(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        await this.assertBlockExists(dto.blockId);
        return this.prisma.projectBudget.create({
            data: {
                projectId: projectBlockId,
                blockId: dto.blockId,
                estimatedAmount: dto.estimatedAmount,
                approvedAmount: dto.approvedAmount,
            },
            include: { block: { include: { translations: true } } },
        });
    }
    async updateBudget(projectId, budgetId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectId: projectBlockId } });
        if (!budget)
            throw new common_1.NotFoundException(`Budget #${budgetId} not found`);
        const { blockId, ...rest } = dto;
        return this.prisma.projectBudget.update({
            where: { id: budgetId },
            data: rest,
            include: { block: { include: { translations: true } } },
        });
    }
    async removeBudget(projectId, budgetId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectId: projectBlockId } });
        if (!budget)
            throw new common_1.NotFoundException(`Budget #${budgetId} not found`);
        await this.prisma.projectBudget.delete({ where: { id: budgetId } });
    }
    async findExpenses(projectId, budgetId, status) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        return this.prisma.projectExpense.findMany({
            where: {
                projectId: projectBlockId,
                ...(budgetId ? { budgetId } : {}),
                ...(status ? { status } : {}),
            },
            include: {
                block: { include: { translations: true } },
                budget: { include: { block: { include: { translations: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createExpense(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        await this.assertBlockExists(dto.blockId);
        if (dto.budgetId) {
            const budget = await this.prisma.projectBudget.findFirst({ where: { id: dto.budgetId, projectId: projectBlockId } });
            if (!budget)
                throw new common_1.NotFoundException(`Budget #${dto.budgetId} not found in this project`);
        }
        return this.prisma.projectExpense.create({
            data: {
                projectId: projectBlockId,
                blockId: dto.blockId,
                budgetId: dto.budgetId,
                amount: dto.amount,
                invoiceRef: dto.invoiceRef,
            },
            include: { block: { include: { translations: true } } },
        });
    }
    async updateExpense(projectId, expenseId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
        if (!expense)
            throw new common_1.NotFoundException(`Expense #${expenseId} not found`);
        if (expense.status === client_1.ExpenseStatus.approved)
            throw new common_1.BadRequestException('Approved expenses cannot be modified');
        const { blockId, ...rest } = dto;
        return this.prisma.projectExpense.update({
            where: { id: expenseId },
            data: rest,
            include: { block: { include: { translations: true } } },
        });
    }
    async updateExpenseStatus(projectId, expenseId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
        if (!expense)
            throw new common_1.NotFoundException(`Expense #${expenseId} not found`);
        if (expense.status !== client_1.ExpenseStatus.pending)
            throw new common_1.BadRequestException('Only pending expenses can be approved/rejected');
        const updated = await this.prisma.projectExpense.update({
            where: { id: expenseId },
            data: { status: dto.status },
        });
        if (dto.status === client_1.ExpenseStatus.approved) {
            await this.prisma.$transaction([
                this.prisma.projectTransaction.create({
                    data: {
                        projectId: projectBlockId,
                        type: 'expense',
                        amount: expense.amount,
                        referenceType: 'expense',
                        referenceId: expenseId,
                    },
                }),
                ...(expense.budgetId
                    ? [
                        this.prisma.projectBudget.update({
                            where: { id: expense.budgetId },
                            data: { actualAmount: { increment: expense.amount } },
                        }),
                    ]
                    : []),
            ]);
        }
        return updated;
    }
    async removeExpense(projectId, expenseId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
        if (!expense)
            throw new common_1.NotFoundException(`Expense #${expenseId} not found`);
        if (expense.status === client_1.ExpenseStatus.approved)
            throw new common_1.BadRequestException('Approved expenses cannot be deleted');
        await this.prisma.projectExpense.delete({ where: { id: expenseId } });
    }
    async findTransactions(projectId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        return this.prisma.projectTransaction.findMany({
            where: { projectId: projectBlockId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createTransaction(projectId, dto) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        return this.prisma.projectTransaction.create({
            data: {
                projectId: projectBlockId,
                type: dto.type,
                amount: dto.amount,
                notes: dto.notes,
            },
        });
    }
    async getSummary(projectId) {
        const projectBlockId = await this.getProjectBlockId(projectId);
        const [income, expense, budgets] = await Promise.all([
            this.prisma.projectTransaction.aggregate({
                where: { projectId: projectBlockId, type: { in: ['income', 'adjustment'] } },
                _sum: { amount: true },
            }),
            this.prisma.projectTransaction.aggregate({
                where: { projectId: projectBlockId, type: 'expense' },
                _sum: { amount: true },
            }),
            this.prisma.projectBudget.aggregate({
                where: { projectId: projectBlockId },
                _sum: { estimatedAmount: true, approvedAmount: true, actualAmount: true },
            }),
        ]);
        const totalIncome = Number(income._sum.amount ?? 0);
        const totalExpense = Number(expense._sum.amount ?? 0);
        return {
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            estimatedBudget: Number(budgets._sum.estimatedAmount ?? 0),
            approvedBudget: Number(budgets._sum.approvedAmount ?? 0),
            actualSpent: Number(budgets._sum.actualAmount ?? 0),
        };
    }
};
exports.FinancialService = FinancialService;
exports.FinancialService = FinancialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FinancialService);
//# sourceMappingURL=financial.service.js.map