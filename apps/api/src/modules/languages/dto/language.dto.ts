import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Direction } from '@prisma/client';

export class CreateLanguageDto {
  @ApiProperty({ example: 'Arabic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'ar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;

  @ApiPropertyOptional({ example: 'sa' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  flagCode?: string;

  @ApiPropertyOptional({ enum: Direction, default: Direction.ltr })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {}
