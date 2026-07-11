import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, Project } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { DomainEvent } from '../../events/domain-event';
import { EventBusService } from '../../events/event-bus.service';
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
    private eventBus: EventBusService,
  ) {}

  /**
   * QR/cash donation approved → cash intake → the project's default fund if
   * it has one (auto-allocated straight through to the project — W9), else
   * the original direct cash → project posting (projects with no
   * primaryFundId are entirely unaffected by W9).
   */
  @OnEvent('donation.approved')
  async onDonationApproved(event: DomainEvent<{ projectId: number; amount: number }>) {
    try {
      const donationId = Number(event.subject.id);
      const project = await this.prisma.project.findUnique({ where: { id: event.data.projectId } });
      if (!project) return;

      if (project.primaryFundId != null) {
        const cash = await this.treasury.platformAccount('cash');
        await this.routeProjectIncomeThroughDefaultFund(event.actor, project, project.primaryFundId, event.data.amount, cash, {
          description: `Donation #${donationId} approved (QR/cash)`,
          referenceType: 'donation',
          referenceId: donationId,
          event: 'donation.approved',
        });
        return;
      }

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

  /** Online donation completed (webhook) → provider clearing → project's default fund (W9), a bare project account, or a fund directly. */
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

        if (project.primaryFundId != null) {
          await this.routeProjectIncomeThroughDefaultFund(event.actor, project, project.primaryFundId, event.data.amount, clearing, {
            description: `Online donation #${donationId} completed (${event.data.provider})`,
            referenceType: 'online_donation',
            referenceId: donationId,
            event: 'payment.completed',
          });
          return;
        }

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

  /**
   * W8 — fund donation confirmed → cash intake → fund account. Manually
   * recorded (cash/bank_transfer/check/card), so it's routed through the same
   * 'cash' platform account as QR/cash project donations (donation.approved,
   * above) rather than a distinct account per payment method — matches the
   * existing convention exactly (no method-specific ledger routing exists
   * anywhere else in the codebase either). paymentMethod stays on the
   * FundDonation row for reporting; it does not change ledger routing.
   */
  @OnEvent('fund_donation.approved')
  async onFundDonationApproved(event: DomainEvent<{ fundId: number; amount: number }>) {
    try {
      const donationId = Number(event.subject.id);
      const [cash, fundAccount] = await Promise.all([
        this.treasury.platformAccount('cash'),
        this.treasury.fundAccount(event.data.fundId),
      ]);
      await this.treasury.post(event.actor, {
        description: `Fund donation #${donationId} confirmed`,
        referenceType: 'fund_donation',
        referenceId: donationId,
        event: 'fund_donation.approved',
        entries: [
          { accountId: cash.id, direction: 'debit', amount: event.data.amount },
          { accountId: fundAccount.id, direction: 'credit', amount: event.data.amount },
        ],
      });
    } catch (err) {
      this.logger.error(`fund_donation.approved posting failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * W8 — fund expense approved → fund account → external counterparty. Unlike
   * a FundAllocation disbursement (fund → project, money earmarked into the
   * project's own account first), an Expense pays a recipient directly in one
   * step: the fund's available balance decreases immediately on approval.
   */
  @OnEvent('fund_expense.approved')
  async onFundExpenseApproved(event: DomainEvent<{ fundId: number; projectId: number; amount: number }>) {
    try {
      const expenseId = Number(event.subject.id);
      const [fundAccount, external] = await Promise.all([
        this.treasury.fundAccount(event.data.fundId),
        this.treasury.platformAccount('external'),
      ]);
      await this.treasury.post(event.actor, {
        description: `Expense #${expenseId} approved (fund #${event.data.fundId} → project #${event.data.projectId})`,
        referenceType: 'fund_expense',
        referenceId: expenseId,
        event: 'fund_expense.approved',
        entries: [
          { accountId: fundAccount.id, direction: 'debit', amount: event.data.amount },
          { accountId: external.id, direction: 'credit', amount: event.data.amount },
        ],
      });
    } catch (err) {
      this.logger.error(`fund_expense.approved posting failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * W9 — a "direct" project donation, routed through the project's default
   * fund so the accounting system always flows through a fund even when the
   * donor experiences it as giving straight to a project:
   *
   *   Donation → Fund (ledger credit) → auto FundAllocation → Project (ledger tranche)
   *
   * The auto-allocation is created already `reconciled` (fully executed) —
   * requiring a Board decision for every individual donation, the way a
   * manually *proposed* allocation does, would defeat "automatic." It posts
   * through the exact entry shape FundsService.disburse() uses (including
   * the `allocation.disbursed` event), so disbursedAmount()/dashboard() need
   * no special-casing to see it.
   *
   * legacyJournal dual-write goes on LEG 1 (donation → fund), not leg 2: from
   * the legacy journal's perspective this project unambiguously received
   * this donation as income — the ledger just also happens to route the
   * money through a fund on the way. Leg 2 carries no dual-write of its own
   * (matching every other fund→project tranche, auto or manual — that
   * transfer itself has never had a legacy counterpart). The allocation is
   * flagged `isAutoAllocated: true` specifically so
   * TreasuryService.reconciliation() knows NOT to exclude it the way it
   * excludes a real multi-fund-financing allocation — this one DOES
   * reconcile against the leg-1 dual-write.
   *
   * Idempotent the same way every other posting in this class is: leg 1
   * carries the caller's own (referenceType, referenceId, event) key, and a
   * replay of that (post() returns `replayed: true`) means leg 2 already ran
   * on the original, non-replayed call — so it's skipped, never re-run.
   */
  private async routeProjectIncomeThroughDefaultFund(
    actor: ActorContext,
    project: Project,
    fundId: number,
    amount: number,
    intakeAccount: { id: number },
    posting: { description: string; referenceType: string; referenceId: number; event: string },
  ): Promise<void> {
    const fundAccount = await this.treasury.fundAccount(fundId);
    const { replayed } = await this.treasury.post(actor, {
      description: `${posting.description} → default fund #${fundId}`,
      referenceType: posting.referenceType,
      referenceId: posting.referenceId,
      event: posting.event,
      entries: [
        { accountId: intakeAccount.id, direction: 'debit', amount },
        { accountId: fundAccount.id, direction: 'credit', amount },
      ],
      // dual-write: from the legacy journal's point of view this project
      // received this donation as income, exactly as it would have without
      // the fund in between.
      legacyJournal: {
        projectBlockId: project.blockId,
        projectRefId: project.id,
        type: 'income',
        referenceType: posting.referenceType,
        referenceId: posting.referenceId,
      },
    });
    if (replayed) return;

    const projectAccount = await this.treasury.projectAccount(project.id);
    const allocation = await this.prisma.fundAllocation.create({
      data: {
        fundId,
        projectId: project.id,
        amount: new Prisma.Decimal(amount),
        status: 'reconciled',
        isAutoAllocated: true,
        note: `Auto-allocated from ${posting.referenceType} #${posting.referenceId} (direct project donation)`,
        createdByUserId: actor.userId,
      },
    });
    const { transaction } = await this.treasury.post(actor, {
      description: `Auto-allocation #${allocation.id}: fund #${fundId} → project #${project.id} (from ${posting.referenceType} #${posting.referenceId})`,
      referenceType: 'fund_allocation',
      referenceId: allocation.id,
      event: 'tranche.1',
      entries: [
        { accountId: fundAccount.id, direction: 'debit', amount },
        { accountId: projectAccount.id, direction: 'credit', amount },
      ],
    });
    this.eventBus.publish({
      event: 'allocation.disbursed',
      actor,
      subject: { type: 'fund_allocation', id: allocation.id },
      data: { tranche: 1, amount, transactionId: transaction.id, auto: true },
    });
  }
}
