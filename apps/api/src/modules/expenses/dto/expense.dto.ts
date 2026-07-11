import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory, ExpenseStatus } from '@prisma/client';

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
