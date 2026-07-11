import { IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { PartyType } from '@prisma/client';

export class CreateDonorDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // W9-stabilization — Funding Platform Audit §5: link to this person's
  // logged-in Participant identity, if known, so donor reports can aggregate
  // across every channel instead of leaving two disconnected identities.
  @IsOptional()
  @IsInt()
  participantId?: number;
}

export class UpdateDonorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  participantId?: number;
}
