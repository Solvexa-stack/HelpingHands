import {
  Controller,
  ForbiddenException,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('Webhooks')
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('stripe')
  @Public()
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) throw new ForbiddenException('Missing stripe-signature header');
    const rawBody = req.rawBody;
    if (!rawBody) throw new ForbiddenException('Missing raw body');
    return this.paymentsService.handleStripeWebhook(rawBody, signature);
  }

  @Post('paypal')
  @Public()
  async handlePayPal(
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
  ) {
    const body = JSON.stringify(req.body);
    return this.paymentsService.handlePayPalWebhook(headers, body);
  }
}
