import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowEffectsSubscriber } from './workflow-effects.subscriber';
import { DecisionParityService } from './decision-parity.service';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

/** W3-E2 — Board governance: decisions, vote rounds, review queue. */
@Module({
  imports: [NotificationsModule, WorkflowModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, DecisionParityService, WorkflowEffectsSubscriber],
  exports: [GovernanceService, DecisionParityService],
})
export class GovernanceModule {}
