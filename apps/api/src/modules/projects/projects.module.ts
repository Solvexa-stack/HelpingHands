import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { FkConsistencyService } from './fk-consistency.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, FkConsistencyService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
