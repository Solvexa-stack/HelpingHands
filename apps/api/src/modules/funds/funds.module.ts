import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrgReportingModule } from '../org-reporting/org-reporting.module';
import { FundHierarchyModule } from '../fund-hierarchy/fund-hierarchy.module';
import { FundsController } from './funds.controller';
import { FundsService } from './funds.service';
import { AgreementsController, OrgAgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

/**
 * W5-E3/E6 — funds, officers, allocations. W6-E1-S2 adds funding agreements.
 * W9 adds the fund hierarchy read (`GET /funds/hierarchy`) — declared as a
 * method on FundsController itself, ahead of `GET /funds/:id`, for the same
 * reason AgreementsController registers before FundsController below:
 * `funds/hierarchy` must not be swallowed by `funds/:id`.
 */
@Module({
  imports: [TreasuryModule, WorkflowModule, OrgReportingModule, FundHierarchyModule],
  controllers: [AgreementsController, OrgAgreementsController, FundsController],
  providers: [FundsService, AgreementsService],
  exports: [FundsService, AgreementsService],
})
export class FundsModule {}
