import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum, IsInt, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { ExpenseStatus, TransactionType } from '@prisma/client';

// ─── Budget ───────────────────────────────────────────────────────────────────

export class CreateBudgetDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiProperty() @IsNumber() @Min(0) estimatedAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) approvedAmount?: number;
}

export class UpdateBudgetDto extends PartialType(CreateBudgetDto) {}

// ─── Expense ──────────────────────────────────────────────────────────────────

export class CreateExpenseDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() budgetId?: number;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceRef?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class UpdateExpenseStatusDto {
  @ApiProperty({ enum: [ExpenseStatus.approved, ExpenseStatus.rejected] })
  @IsEnum(ExpenseStatus)
  status: ExpenseStatus;
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType }) @IsEnum(TransactionType) type: TransactionType;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
