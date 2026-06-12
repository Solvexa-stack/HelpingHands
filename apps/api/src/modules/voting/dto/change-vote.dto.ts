import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VoteChoice } from '@prisma/client';

export class ChangeVoteDto {
  @ApiProperty({ enum: VoteChoice })
  @IsEnum(VoteChoice)
  choice: VoteChoice;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
