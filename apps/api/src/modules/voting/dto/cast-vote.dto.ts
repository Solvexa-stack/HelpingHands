import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { VoteChoice } from '@prisma/client';

export class CastVoteDto {
  @ApiProperty()
  @IsInt()
  studyId: number;

  @ApiProperty({ enum: VoteChoice })
  @IsEnum(VoteChoice)
  choice: VoteChoice;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
