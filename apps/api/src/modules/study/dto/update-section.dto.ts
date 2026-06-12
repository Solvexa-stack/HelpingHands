import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { SectionStatus } from '@prisma/client';

export class UpdateSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ enum: SectionStatus })
  @IsOptional()
  @IsEnum(SectionStatus)
  status?: SectionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  assignedTo?: number;
}
