import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ExecutionStage, ProjectCategory } from '@prisma/client';

export class CreateProjectDto {
  @ApiProperty({ description: 'Block ID for project content' })
  @IsInt()
  blockId: number;

  @ApiPropertyOptional({ example: 'Nairobi, Kenya' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfCompletion?: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(1)
  value: number;

  // W6-E2: the taxonomy node is the category truth. The legacy enum value is
  // still accepted from old clients and resolved to its node — the enum
  // column itself is frozen and never written.
  @ApiPropertyOptional({ description: 'Category node id (civic taxonomy)' })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Category node key, e.g. "water" or "agricultural"' })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional({ enum: ProjectCategory, description: 'Legacy category (resolved to its node)' })
  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;

  @ApiPropertyOptional({
    description: 'Lifecycle definition: default project-lifecycle; "emergency-relief" is Board-only',
  })
  @IsOptional()
  @IsString()
  lifecycle?: 'project-lifecycle' | 'emergency-relief';

  // W6 addendum — fund of record: identity attribution (chosen at creation,
  // locked after Board approval), distinct from FundAllocation financing.
  @ApiPropertyOptional({ description: 'Fund of record — the fund this project is administratively attributed to' })
  @IsOptional()
  @IsInt()
  fundId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Financial officer admin ID' })
  @IsOptional()
  @IsInt()
  financialOfficerId?: number;

  // W9-stabilization — Funding Platform Audit §3: current stage in the
  // standard execution lifecycle (planning/procurement/execution/inspection/completion).
  @ApiPropertyOptional({ enum: ExecutionStage })
  @IsOptional()
  @IsEnum(ExecutionStage)
  currentStage?: ExecutionStage;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class ProjectQueryDto {
  @ApiPropertyOptional({ enum: ProjectCategory, description: 'Legacy enum filter (resolved to its node)' })
  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;

  @ApiPropertyOptional({ description: 'Category node key filter — matches the node and its descendants' })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Filter by owning organization id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  organizationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter completed projects' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined)
  @IsBoolean()
  isCompleted?: boolean;

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
  lang?: string;

  @ApiPropertyOptional({ enum: ['value', 'progression', 'createdAt'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
