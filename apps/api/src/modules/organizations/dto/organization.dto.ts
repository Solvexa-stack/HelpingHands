import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

export const DEFAULT_CAPABILITIES = {
  canExecuteProjects: false,
  canReceivePublicFunds: false,
  canOpenDonations: false,
  isGovernmentEntity: false,
  requiresBoardOversight: false,
};
