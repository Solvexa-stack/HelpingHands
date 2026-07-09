import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export { PaymentProvider };

export class CreateCheckoutDto {
  @ApiPropertyOptional({ description: 'Target project (exactly one of projectId | fundId)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  projectId?: number;

  @ApiPropertyOptional({ description: 'W5: fund-directed donation target' })
  @IsOptional()
  @IsInt()
  @Min(1)
  fundId?: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

  @ApiPropertyOptional({ description: 'Currency code, defaults to USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}
