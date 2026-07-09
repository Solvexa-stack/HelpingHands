import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../../events/domain-event';
import { PrismaService } from '../../prisma/prisma.service';
import { TreasuryService } from './treasury.service';

/**
 * W5-E5 — money-event routing: the owning modules keep their endpoints and
 * UX and emit the events they always did (now awaited); Treasury consumes
 * them and posts the double-entry credit/debit. Idempotency lives in the
 * posting API, so webhook retries and replays are safe.
 */
@Injectable()
export class MoneyEventsSubscriber {
  private readonly logger = new Logger(MoneyEventsSubscriber.name);

  constructor(
    private prisma: PrismaService,
    private treasury: TreasuryService,
  ) {}

  /** QR/cash donation approved → cash intake → project account. */
  @OnEvent('donation.approved')
  async onDonationApproved(event: DomainEvent<{ projectId: number; amount: number }>) {
    try {
      const donationId = Number(event.subject.id);
      const project = await this.prisma.project.findUnique({ where: { id: event.data.projectId } });
      if (!project) return;
      const [cash, projectAccount] = await Promise.all([
        this.treasury.platformAccount('cash'),
        this.treasury.projectAccount(project.id),
      ]);
      await this.treasury.post(event.actor, {
        description: `Donation #${donationId} approved (QR/cash)`,
        referenceType: 'donation',
        referenceId: donationId,
        event: 'donation.approved',
        entries: [
          { accountId: cash.id, direction: 'debit', amount: event.data.amount },
          { accountId: projectAccount.id, direction: 'credit', amount: event.data.amount },
        ],
        // dual-write: the exact legacy income row donations.service used to append
        legacyJournal: {
          projectBlockId: project.blockId,
          projectRefId: project.id,
          type: 'income',
          referenceType: 'donation',
          referenceId: donationId,
        },
      });
    } catch (err) {
      this.logger.error(`donation.approved posting failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Online donation completed (webhook) → provider clearing → project or fund account. */
  @OnEvent('payment.completed')
  async onPaymentCompleted(
    event: DomainEvent<{ projectId: number | null; fundId?: number | null; provider: string; amount: number }>,
  ) {
    try {
      const donationId = Number(event.subject.id);
      const clearing = await this.treasury.providerClearingAccount(event.data.provider);

      if (event.data.projectId != null) {
        const project = await this.prisma.project.findUnique({ where: { id: event.data.projectId } });
        if (!project) return;
        const projectAccount = await this.treasury.projectAccount(project.id);
        await this.treasury.post(event.actor, {
          description: `Online donation #${donationId} completed (${event.data.provider})`,
          referenceType: 'online_donation',
          referenceId: donationId,
          event: 'payment.completed',
          entries: [
            { accountId: clearing.id, direction: 'debit', amount: event.data.amount },
            { accountId: projectAccount.id, direction: 'credit', amount: event.data.amount },
          ],
          legacyJournal: {
            projectBlockId: project.blockId,
            projectRefId: project.id,
            type: 'income',
            referenceType: 'online_donation',
            referenceId: donationId,
          },
        });
      } else if (event.data.fundId != null) {
        const fundAccount = await this.treasury.fundAccount(event.data.fundId);
        await this.treasury.post(event.actor, {
          description: `Fund-directed online donation #${donationId} (${event.data.provider})`,
          referenceType: 'online_donation',
          referenceId: donationId,
          event: 'payment.completed',
          entries: [
            { accountId: clearing.id, direction: 'debit', amount: event.data.amount },
            { accountId: fundAccount.id, direction: 'credit', amount: event.data.amount },
          ],
        });
      }
    } catch (err) {
      this.logger.error(`payment.completed posting failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Expense approved → project account → external counterparty. */
  @OnEvent('expense.approved')
  async onExpenseApproved(
    event: DomainEvent<{ projectId: number; budgetId: number | null; amount: number }>,
  ) {
    try {
      const expenseId = Number(event.subject.id);
      const project = await this.prisma.project.findUnique({ where: { id: event.data.projectId } });
      if (!project) return;
      const [projectAccount, external] = await Promise.all([
        this.treasury.projectAccount(project.id),
        this.treasury.platformAccount('external'),
      ]);
      await this.treasury.post(event.actor, {
        description: `Expense #${expenseId} approved`,
        referenceType: 'expense',
        referenceId: expenseId,
        event: 'expense.approved',
        entries: [
          { accountId: projectAccount.id, direction: 'debit', amount: event.data.amount },
          { accountId: external.id, direction: 'credit', amount: event.data.amount },
        ],
        // dual-write: the exact legacy expense row financial.service used to append
        legacyJournal: {
          projectBlockId: project.blockId,
          projectRefId: project.id,
          type: 'expense',
          referenceType: 'expense',
          referenceId: expenseId,
        },
      });
    } catch (err) {
      this.logger.error(`expense.approved posting failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
