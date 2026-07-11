import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ParticipationsService } from './participations.service';
import { ParticipationsController } from './participations.controller';
import { FkConsistencyService } from './fk-consistency.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { CategoriesModule } from '../categories/categories.module';
import { FundHierarchyModule } from '../fund-hierarchy/fund-hierarchy.module';

/** Projects + W6-E1/E5 joint-project participations and project-scope grants. */
@Module({
  imports: [WorkflowModule, CategoriesModule, FundHierarchyModule],
  controllers: [ProjectsController, ParticipationsController],
  providers: [ProjectsService, ParticipationsService, FkConsistencyService],
  exports: [ProjectsService, ParticipationsService],
})
export class ProjectsModule {}
