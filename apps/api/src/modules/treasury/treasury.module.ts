import { Module } from '@nestjs/common';
import { MoneyEventsSubscriber } from './money-events.subscriber';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

/** W5-E2 — the treasury: sole ledger writer, money-event consumer. */
@Module({
  controllers: [TreasuryController],
  providers: [TreasuryService, MoneyEventsSubscriber],
  exports: [TreasuryService],
})
export class TreasuryModule {}
