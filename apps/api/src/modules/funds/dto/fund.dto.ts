import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { ExecutionStage, FundStatus, FundType, FundDonationMethod } from '@prisma/client';

export class CreateFundDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsEnum(FundType)
  type?: FundType;

  @IsOptional()
  @IsInt()
  managingOrganizationId?: number;

  @IsOptional()
  @IsInt()
  donorId?: number;

  // W9 — required for type=master (delegates to FundHierarchyService.ensureMasterFund,
  // one master fund per sector) and, when given, also for type=organization
  // (delegates to ensureOrganizationFund). See FundsService.create.
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsObject()
  policy?: Record<string, unknown>;
}

export class UpdateFundDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsEnum(FundStatus)
  status?: FundStatus;

  @IsOptional()
  @IsEnum(FundType)
  type?: FundType;

  @IsOptional()
  @IsInt()
  managingOrganizationId?: number;

  @IsOptional()
  @IsInt()
  donorId?: number;

  @IsOptional()
  @IsObject()
  policy?: Record<string, unknown>;
}

export class ProposeAllocationDto {
  @IsInt()
  projectId: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  fundingAgreementId?: number;

  // W9-stabilization — Funding Platform Audit §3: which execution stage this
  // reserved budget is for.
  @IsOptional()
  @IsEnum(ExecutionStage)
  stage?: ExecutionStage;
}

export class CreateFundDonationDto {
  @IsOptional()
  @IsInt()
  donorId?: number;

  @IsOptional()
  @IsInt()
  participantId?: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(FundDonationMethod)
  paymentMethod: FundDonationMethod;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsISO8601()
  donatedAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
