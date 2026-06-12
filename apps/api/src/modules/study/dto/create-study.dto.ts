import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStudyDto {
  @ApiProperty()
  @IsInt()
  projectId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  votingStartsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  votingEndsAt?: string;
}
