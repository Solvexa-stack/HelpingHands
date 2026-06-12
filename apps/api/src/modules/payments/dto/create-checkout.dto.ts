import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export { PaymentProvider };

export class CreateCheckoutDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  projectId: number;

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
