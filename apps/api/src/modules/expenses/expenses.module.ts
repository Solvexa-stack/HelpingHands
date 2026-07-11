import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';

/** W8 — expenses + the recipient/invoice master data they reference. */
@Module({
  imports: [TreasuryModule],
  controllers: [ExpensesController, RecipientsController, InvoicesController],
  providers: [ExpensesService, RecipientsService, InvoicesService],
  exports: [ExpensesService, RecipientsService, InvoicesService],
})
export class ExpensesModule {}
