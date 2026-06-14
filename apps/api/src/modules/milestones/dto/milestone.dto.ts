import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { MilestoneStatus } from '@prisma/client';

export class CreateMilestoneDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetDate?: string;
  @ApiPropertyOptional({ enum: MilestoneStatus }) @IsOptional() @IsEnum(MilestoneStatus) status?: MilestoneStatus;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {
  @ApiPropertyOptional() @IsOptional() @IsDateString() completedAt?: string;
}
