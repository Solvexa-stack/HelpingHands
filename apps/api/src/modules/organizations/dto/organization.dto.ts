import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MembershipStatus, OrganizationStatus, OrganizationType } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({ enum: OrganizationType })
  @IsEnum(OrganizationType)
  type: OrganizationType;

  @ApiProperty({ example: 'HelpingHands' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Content block for the public profile' })
  @IsOptional()
  @IsInt()
  contentBlockId?: number;
}

export class UpdateOrganizationDto extends PartialType(
  PickType(CreateOrganizationDto, ['name', 'registrationNumber', 'contentBlockId'] as const),
) {
  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}

/** 03_DATA_MODEL.md §1 — the five capability switches. */
export class CapabilitiesDto {
  @ApiProperty() @IsBoolean() canExecuteProjects: boolean;
  @ApiProperty() @IsBoolean() canReceivePublicFunds: boolean;
  @ApiProperty() @IsBoolean() canOpenDonations: boolean;
  @ApiProperty() @IsBoolean() isGovernmentEntity: boolean;
  @ApiProperty() @IsBoolean() requiresBoardOversight: boolean;
}

/**
 * Workspace member invitation/creation. Two modes:
 *  - without `password`: invitation — the invitee sets their own password via
 *    the activation link (email / dev fallback);
 *  - with `password`: the workspace owner sets credentials directly and the
 *    member can log in immediately.
 * `role` comes from the organization role catalog (default org_admin).
 */
export class InviteMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ description: 'Set credentials directly; omit to send an activation link' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must contain uppercase, lowercase, a number and a special character',
  })
  password?: string;

  @ApiPropertyOptional({ enum: ['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'], default: 'org_admin' })
  @IsOptional()
  @IsIn(['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'])
  role?: string;
}

export class AddMemberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  userId: number;

  @ApiPropertyOptional({ enum: MembershipStatus, default: MembershipStatus.active })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

export class OrganizationQueryDto {
  @ApiPropertyOptional({ enum: OrganizationType })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 15;
}

/**
 * W6-E3-S1 — self-service registration (flag-gated; pilot allowlist). The
 * contact becomes the org's first org_admin with direct credentials.
 */
export class RegisterOrganizationDto {
  @ApiProperty({ enum: ['municipality', 'youth_team'] })
  @IsEnum(OrganizationType)
  type: OrganizationType;

  @ApiProperty({ example: 'Municipality of Al-Karama' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Official registration number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  registrationNumber: string;

  @ApiProperty({ example: 'mayor@alkarama.gov' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  adminFirstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  adminLastName: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must contain uppercase, lowercase, a number and a special character',
  })
  adminPassword: string;
}

export const DEFAULT_CAPABILITIES = {
  canExecuteProjects: false,
  canReceivePublicFunds: false,
  canOpenDonations: false,
  isGovernmentEntity: false,
  requiresBoardOversight: false,
};
