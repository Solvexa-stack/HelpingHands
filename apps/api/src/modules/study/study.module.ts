import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GovernanceModule } from '../governance/governance.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [NotificationsModule, GovernanceModule, WorkflowModule, CategoriesModule],
  controllers: [StudyController],
  providers: [StudyService],
  exports: [StudyService],
})
export class StudyModule {}
