import { ExpenseStatus } from '@prisma/client';
import { FinancialService } from './financial.service';
import { CreateBudgetDto, UpdateBudgetDto, CreateExpenseDto, UpdateExpenseDto, UpdateExpenseStatusDto, CreateTransactionDto } from './dto/financial.dto';
export declare class FinancialController {
    private financialService;
    constructor(financialService: FinancialService);
    findBudgets(projectId: number): Promise<any>;
    createBudget(projectId: number, dto: CreateBudgetDto): Promise<any>;
    updateBudget(projectId: number, id: number, dto: UpdateBudgetDto): Promise<any>;
    removeBudget(projectId: number, id: number): Promise<void>;
    findExpenses(projectId: number, budgetId?: string, status?: ExpenseStatus): Promise<any>;
    createExpense(projectId: number, dto: CreateExpenseDto): Promise<any>;
    updateExpense(projectId: number, id: number, dto: UpdateExpenseDto): Promise<any>;
    updateExpenseStatus(projectId: number, id: number, dto: UpdateExpenseStatusDto): Promise<any>;
    removeExpense(projectId: number, id: number): Promise<void>;
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
