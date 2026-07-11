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
import { FundStatus, FundType, FundDonationMethod } from '@prisma/client';

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
