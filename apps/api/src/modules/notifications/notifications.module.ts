import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { EmailProcessor } from '../email/email.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'email' }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, EmailProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
