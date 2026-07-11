import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module';
import { FundHierarchyService } from './fund-hierarchy.service';

/**
 * W9 — standalone on purpose: TreasuryModule needs FundHierarchyService for
 * nothing (the auto-allocation posting lives directly in
 * MoneyEventsSubscriber, see its file comment), so this only needs to import
 * TreasuryModule, never the reverse — no circular module dependency.
 */
@Module({
  imports: [TreasuryModule],
  providers: [FundHierarchyService],
  exports: [FundHierarchyService],
})
export class FundHierarchyModule {}
