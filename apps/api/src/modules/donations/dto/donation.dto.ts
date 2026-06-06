import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DonationStatus } from '@prisma/client';

export class CreateDonationDto {
  @ApiProperty({ description: 'Project ID' })
  @IsInt()
  projectId: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(1)
  amount: number;
}

export class UpdateDonationStatusDto {
  @ApiProperty({ enum: [DonationStatus.approved, DonationStatus.rejected, DonationStatus.cancelled] })
  @IsEnum(DonationStatus)
  status: DonationStatus;

  @ApiPropertyOptional({ example: 'Payment verified in person' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DonationQueryDto {
  @ApiPropertyOptional({ enum: DonationStatus })
  @IsOptional()
  @IsEnum(DonationStatus)
  status?: DonationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  participantId?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
