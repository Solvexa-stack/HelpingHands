import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { FkConsistencyService } from './fk-consistency.service';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [WorkflowModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, FkConsistencyService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
