import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DecisionParityService } from './decision-parity.service';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

/** W3-E2 — Board governance: decisions, vote rounds, review queue. */
@Module({
  imports: [NotificationsModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, DecisionParityService],
  exports: [GovernanceService, DecisionParityService],
})
export class GovernanceModule {}
