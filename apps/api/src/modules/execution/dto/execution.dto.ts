import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StepStatus, PhaseStatus, TaskStatus } from '@prisma/client';

// ─── Steps ────────────────────────────────────────────────────────────────────

export class CreateStepDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() parentId?: number;
  @ApiPropertyOptional({ enum: StepStatus }) @IsOptional() @IsEnum(StepStatus) status?: StepStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

export class UpdateStepDto extends PartialType(CreateStepDto) {}

export class UpdateProgressDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @Min(0)
  @Max(100)
  progress: number;
}

// ─── Phases ───────────────────────────────────────────────────────────────────

export class CreatePhaseDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional({ enum: PhaseStatus }) @IsOptional() @IsEnum(PhaseStatus) status?: PhaseStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

export class UpdatePhaseDto extends PartialType(CreatePhaseDto) {}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export class CreateTaskDto {
  @ApiProperty() @IsInt() blockId: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() phaseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() assignedToId?: number;
  @ApiPropertyOptional({ enum: TaskStatus }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
