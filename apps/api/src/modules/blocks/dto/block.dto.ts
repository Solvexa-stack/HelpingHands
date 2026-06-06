import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BlockCategory } from '@prisma/client';

export class BlockTranslationDto {
  @ApiProperty({ example: 'en' })
  @IsString()
  @IsNotEmpty()
  languageCode: string;

  @ApiProperty({ example: 'My Blog Post' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;

  @ApiProperty({ example: 'my-blog-post' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  slug: string;

  @ApiProperty({ example: 'Short description' })
  @IsString()
  @IsNotEmpty()
  brief: string;

  @ApiProperty({ example: 'Full content...' })
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CreateBlockDto {
  @ApiProperty({ enum: BlockCategory })
  @IsEnum(BlockCategory)
  category: BlockCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classification?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [BlockTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockTranslationDto)
  translations: BlockTranslationDto[];
}

export class UpdateBlockDto extends PartialType(CreateBlockDto) {}

export class BlockQueryDto {
  @ApiPropertyOptional({ enum: BlockCategory })
  @IsOptional()
  @IsEnum(BlockCategory)
  category?: BlockCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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
  @IsBoolean()
  @Type(() => Boolean)
  activeOnly?: boolean = true;
}
