import { Module } from '@nestjs/common';
import { GuardRegistryService } from './guard-registry.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowParityService } from './workflow-parity.service';

/** W4-E1 — the workflow engine: three operations, guard registry, effects. */
@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService, GuardRegistryService, WorkflowParityService],
  exports: [WorkflowService, GuardRegistryService, WorkflowParityService],
})
export class WorkflowModule {}
