import { ExpenseStatus, TransactionType } from '@prisma/client';
export declare class CreateBudgetDto {
    blockId: number;
    estimatedAmount: number;
    approvedAmount?: number;
}
declare const UpdateBudgetDto_base: any;
export declare class UpdateBudgetDto extends UpdateBudgetDto_base {
}
export declare class CreateExpenseDto {
    blockId: number;
    budgetId?: number;
    amount: number;
    invoiceRef?: string;
}
declare const UpdateExpenseDto_base: any;
export declare class UpdateExpenseDto extends UpdateExpenseDto_base {
}
export declare class UpdateExpenseStatusDto {
    status: ExpenseStatus;
}
export declare class CreateTransactionDto {
    type: TransactionType;
    amount: number;
    notes?: string;
}
export {};
