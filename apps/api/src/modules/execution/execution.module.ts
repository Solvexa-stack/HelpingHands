import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, WorkflowModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
