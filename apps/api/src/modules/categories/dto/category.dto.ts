import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/, { message: 'key must be lowercase letters, digits, "_" or "-" only' })
  key: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  nameFr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  nameFr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
