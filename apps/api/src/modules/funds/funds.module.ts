import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { FundsController } from './funds.controller';
import { FundsService } from './funds.service';

/** W5-E3/E6 — funds, officers, allocations. */
@Module({
  imports: [TreasuryModule, WorkflowModule],
  controllers: [FundsController],
  providers: [FundsService],
  exports: [FundsService],
})
export class FundsModule {}
