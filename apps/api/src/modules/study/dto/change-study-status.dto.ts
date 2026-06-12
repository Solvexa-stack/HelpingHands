import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { StudyStatus } from '@prisma/client';

export class ChangeStudyStatusDto {
  @ApiProperty({ enum: StudyStatus })
  @IsEnum(StudyStatus)
  status: StudyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  votingStartsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  votingEndsAt?: string;
}
