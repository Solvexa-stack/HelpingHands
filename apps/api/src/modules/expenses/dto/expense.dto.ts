import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ExecutionStage, ExpenseCategory, ExpenseStatus } from '@prisma/client';

export class CreateExpenseDto {
  @IsInt()
  fundId: number;

  @IsInt()
  projectId: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsString()
  description: string;

  @IsInt()
  recipientId: number;

  @IsOptional()
  @IsInt()
  invoiceId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ExecutionStage)
  stage?: ExecutionStage;
}

export class MarkExpensePaidDto {
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ExpenseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fundId?: number;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;
}
