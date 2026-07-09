import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BoardDecisionType, GovernanceSubjectType, VoteChoice } from '@prisma/client';

export class RecordDecisionDto {
  @ApiProperty({ enum: GovernanceSubjectType })
  @IsEnum(GovernanceSubjectType)
  subjectType: GovernanceSubjectType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  subjectId: number;

  @ApiProperty({ enum: BoardDecisionType })
  @IsEnum(BoardDecisionType)
  decision: BoardDecisionType;

  @ApiProperty({ description: 'Mandatory — accountability is the point (14 §risks)' })
  @IsString()
  @IsNotEmpty()
  rationale: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  voteRoundId?: number;
}

export class OpenRoundDto {
  @ApiProperty({ enum: GovernanceSubjectType })
  @IsEnum(GovernanceSubjectType)
  subjectType: GovernanceSubjectType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  subjectId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({ description: 'Eligibility policy; default = current study electorate (authenticated)' })
  @IsOptional()
  @IsObject()
  eligibility?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Quorum/threshold rules; empty = tally only (current behavior)' })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class CastRoundVoteDto {
  @ApiProperty({ enum: VoteChoice })
  @IsEnum(VoteChoice)
  choice: VoteChoice;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class DecisionQueryDto {
  @ApiPropertyOptional({ enum: GovernanceSubjectType })
  @IsOptional()
  @IsEnum(GovernanceSubjectType)
  subjectType?: GovernanceSubjectType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  subjectId?: number;
}
