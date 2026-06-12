import { Module } from '@nestjs/common';
import { VotingController } from './voting.controller';
import { VotingService } from './voting.service';
import { VotingScheduler } from './voting.scheduler';
import { StudyModule } from '../study/study.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [StudyModule, NotificationsModule],
  controllers: [VotingController],
  providers: [VotingService, VotingScheduler],
  exports: [VotingService],
})
export class VotingModule {}
