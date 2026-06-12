import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { PayPalService } from './paypal.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, StripeService, PayPalService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
