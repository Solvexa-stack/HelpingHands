import { PrismaService } from '../../prisma/prisma.service';
import { CreateBudgetDto, UpdateBudgetDto, CreateExpenseDto, UpdateExpenseDto, UpdateExpenseStatusDto, CreateTransactionDto } from './dto/financial.dto';
import { ExpenseStatus } from '@prisma/client';
export declare class FinancialService {
    private prisma;
    constructor(prisma: PrismaService);
    private getProjectBlockId;
    private assertBlockExists;
    findBudgets(projectId: number): Promise<any>;
    createBudget(projectId: number, dto: CreateBudgetDto): Promise<any>;
    updateBudget(projectId: number, budgetId: number, dto: UpdateBudgetDto): Promise<any>;
    removeBudget(projectId: number, budgetId: number): Promise<void>;
    findExpenses(projectId: number, budgetId?: number, status?: ExpenseStatus): Promise<any>;
    createExpense(projectId: number, dto: CreateExpenseDto): Promise<any>;
    updateExpense(projectId: number, expenseId: number, dto: UpdateExpenseDto): Promise<any>;
    updateExpenseStatus(projectId: number, expenseId: number, dto: UpdateExpenseStatusDto): Promise<any>;
    removeExpense(projectId: number, expenseId: number): Promise<void>;
    findTransactions(projectId: number): Promise<any>;
    createTransaction(projectId: number, dto: CreateTransactionDto): Promise<any>;
    getSummary(projectId: number): Promise<{
        totalIncome: number;
        totalExpense: number;
        balance: number;
        estimatedBudget: number;
        approvedBudget: number;
        actualSpent: number;
    }>;
}
