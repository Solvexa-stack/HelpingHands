import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentFiltersDto } from './dto/payment-filters.dto';

@ApiTags('Payments')
@ApiBearerAuth('JWT')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('checkout')
  @Roles('participant')
  @ApiOperation({ summary: 'Create a Stripe or PayPal checkout for a project donation' })
  createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser('referenceId') participantId: number,
  ) {
    return this.paymentsService.createCheckout(dto, participantId);
  }

  @Get('donations/:id/status')
  @ApiOperation({ summary: 'Get the status of an online donation' })
  getDonationStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.getDonationStatus(id, user);
  }

  @Get('donations')
  @Roles(AdminRole.administrator, AdminRole.employee, 'participant')
  @ApiOperation({ summary: 'List online donations (admin sees all, participant sees own)' })
  listDonations(
    @Query() filters: PaymentFiltersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.listOnlineDonations(filters, user);
  }
}
