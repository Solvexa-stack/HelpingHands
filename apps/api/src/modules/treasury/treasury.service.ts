import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountKind, AccountOwnerType, LedgerDirection, Prisma, TransactionType } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { allowLegacyJournalWrite } from '../../prisma/legacy-journal';
import { PrismaService } from '../../prisma/prisma.service';

export interface PostingEntry {
  accountId: number;
  direction: LedgerDirection;
  amount: number | Prisma.Decimal;
}

export interface PostingInput {
  description: string;
  referenceType?: string;
  referenceId?: number;
  /** idempotency discriminator, e.g. 'donation.approved' */
  event?: string;
  entries: PostingEntry[];
  currency?: string;
  /** dual-write bridge: append the matching legacy journal row (new→old, until W8) */
  legacyJournal?: {
    projectBlockId: number;
    projectRefId: number;
    type: TransactionType;
    referenceType?: string;
    referenceId?: number;
    notes?: string;
  };
}

/** Well-known platform accounts (created by the W5 backfill / ensured lazily). */
export const PLATFORM_ACCOUNTS = {
  cash: { ownerType: 'provider_clearing' as AccountOwnerType, name: 'Physical Cash Intake', kind: 'asset' as AccountKind },
  stripe: { ownerType: 'provider_clearing' as AccountOwnerType, name: 'Stripe Clearing', kind: 'asset' as AccountKind },
  paypal: { ownerType: 'provider_clearing' as AccountOwnerType, name: 'PayPal Clearing', kind: 'asset' as AccountKind },
  external: { ownerType: 'external' as AccountOwnerType, name: 'External Counterparties', kind: 'expense' as AccountKind },
};

/**
 * W5-E2 — the treasury: SOLE writer of ledger tables (module rule from 02;
 * enforced by the `treasury-only-ledger-writes` lint until W8 DB grants).
 * Transactions are immutable — corrections are reversing transactions.
 */
@Injectable()
export class TreasuryService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  // ─── Accounts ────────────────────────────────────────────────────────────────

  async ensureAccount(ownerType: AccountOwnerType, ownerId: number | null, name: string, kind: AccountKind, currency = 'USD') {
    const existing = await this.prisma.account.findFirst({
      where: ownerId != null ? { ownerType, ownerId, currency } : { ownerType, name, currency },
    });
    if (existing) return existing;
    return this.prisma.account.create({ data: { ownerType, ownerId, name, kind, currency } });
  }

  projectAccount(projectId: number) {
    return this.ensureAccount('project', projectId, `Project #${projectId}`, 'liability');
  }

  fundAccount(fundId: number, fundName?: string) {
    return this.ensureAccount('fund', fundId, fundName ? `Fund: ${fundName}` : `Fund #${fundId}`, 'liability');
  }

  platformAccount(key: keyof typeof PLATFORM_ACCOUNTS) {
    const spec = PLATFORM_ACCOUNTS[key];
    return this.ensureAccount(spec.ownerType, null, spec.name, spec.kind);
  }

  providerClearingAccount(provider: string) {
    if (provider === 'stripe') return this.platformAccount('stripe');
    if (provider === 'paypal') return this.platformAccount('paypal');
    return this.platformAccount('cash');
  }

  // ─── Posting (the only write path) ───────────────────────────────────────────

  /**
   * Post a balanced transaction atomically. Idempotent on
   * `(referenceType, referenceId, event)`: a replay returns the original
   * transaction without posting twice (webhook retries, re-approvals).
   */
  async post(actor: ActorContext, input: PostingInput) {
    if (input.entries.length < 2) {
      throw new BadRequestException('A ledger transaction needs at least two entries');
    }
    const debits = input.entries
      .filter((e) => e.direction === 'debit')
      .reduce((s, e) => s.plus(new Prisma.Decimal(e.amount)), new Prisma.Decimal(0));
    const credits = input.entries
      .filter((e) => e.direction === 'credit')
      .reduce((s, e) => s.plus(new Prisma.Decimal(e.amount)), new Prisma.Decimal(0));
    if (!debits.equals(credits)) {
      throw new BadRequestException(`Unbalanced transaction: debits ${debits} ≠ credits ${credits}`);
    }
    if (input.entries.some((e) => new Prisma.Decimal(e.amount).lte(0))) {
      throw new BadRequestException('Entry amounts must be positive');
    }

    // idempotent replay
    if (input.referenceType && input.referenceId != null && input.event) {
      const existing = await this.prisma.ledgerTransaction.findUnique({
        where: {
          referenceType_referenceId_event: {
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            event: input.event,
          },
        },
        include: { entries: true },
      });
      if (existing) return { transaction: existing, replayed: true };
    }

    const currency = input.currency ?? 'USD';
    const transaction = await allowLegacyJournalWrite(async () =>
      this.prisma.$transaction(async (tx) => {
        const header = await tx.ledgerTransaction.create({
          data: {
            actorUserId: actor.userId,
            description: input.description,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            event: input.event,
            entries: {
              create: input.entries.map((e) => ({
                accountId: e.accountId,
                direction: e.direction,
                amount: new Prisma.Decimal(e.amount),
                currency,
              })),
            },
          },
          include: { entries: true },
        });

        // dual-write bridge: the legacy journal row rides the same transaction
        if (input.legacyJournal) {
          await tx.projectTransaction.create({
            data: {
              projectId: input.legacyJournal.projectBlockId,
              projectRefId: input.legacyJournal.projectRefId,
              type: input.legacyJournal.type,
              amount: new Prisma.Decimal(
                input.entries.find((e) => e.direction === 'credit')!.amount,
              ),
              referenceType: input.legacyJournal.referenceType,
              referenceId: input.legacyJournal.referenceId,
              notes: input.legacyJournal.notes,
            },
          });
        }
        return header;
      }),
    );

    this.eventBus.publish({
      event: 'ledger.posted',
      actor,
      subject: { type: 'ledger_transaction', id: transaction.id },
      data: {
        description: input.description,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        entries: transaction.entries.length,
        amount: Number(credits),
      },
    });

    return { transaction, replayed: false };
  }

  // ─── Balances & statements ───────────────────────────────────────────────────

  /** Kind-aware balance: asset/expense grow with debits; liability/income with credits. */
  async balance(accountId: number): Promise<number> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account #${accountId} not found`);
    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: { accountId, transaction: { status: 'posted' } },
      _sum: { amount: true },
    });
    const debit = Number(grouped.find((g) => g.direction === 'debit')?._sum.amount ?? 0);
    const credit = Number(grouped.find((g) => g.direction === 'credit')?._sum.amount ?? 0);
    const debitPositive = account.kind === 'asset' || account.kind === 'expense';
    return debitPositive ? debit - credit : credit - debit;
  }

  async statement(accountId: number, from?: Date, to?: Date) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account #${accountId} not found`);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        accountId,
        transaction: {
          status: 'posted',
          ...(from || to ? { timestamp: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      include: { transaction: true },
      orderBy: { id: 'asc' },
    });
    const debitPositive = account.kind === 'asset' || account.kind === 'expense';
    let running = 0;
    const rows = entries.map((e) => {
      const signed = (e.direction === 'debit') === debitPositive ? Number(e.amount) : -Number(e.amount);
      running += signed;
      return {
        id: e.id,
        timestamp: e.transaction.timestamp,
        description: e.transaction.description,
        referenceType: e.transaction.referenceType,
        referenceId: e.transaction.referenceId,
        direction: e.direction,
        amount: Number(e.amount),
        runningBalance: Math.round(running * 100) / 100,
        flaggable: true,
        transactionId: e.transactionId,
      };
    });
    return { account, entries: rows, balance: Math.round(running * 100) / 100 };
  }

  /** W5-E4 reconciliation gate: legacy journal net vs ledger balance, per project. */
  async reconciliation(): Promise<
    Array<{ projectId: number; legacyNet: number; ledgerBalance: number; equal: boolean }>
  > {
    // eslint-disable-next-line no-unscoped-org-reads -- platform reconciliation sweep over all tenants (Board-only endpoint)
    const projects = await this.prisma.project.findMany({ select: { id: true } });
    const results: Array<{ projectId: number; legacyNet: number; ledgerBalance: number; equal: boolean }> = [];
    for (const { id } of projects) {
      const grouped = await this.prisma.projectTransaction.groupBy({
        by: ['type'],
        where: { projectRefId: id },
        _sum: { amount: true },
      });
      const of = (t: string) => Number(grouped.find((g) => g.type === t)?._sum.amount ?? 0);
      const legacyNet = Math.round((of('income') + of('adjustment') - of('expense') - of('refund')) * 100) / 100;
      const account = await this.prisma.account.findFirst({ where: { ownerType: 'project', ownerId: id } });
      // fund→project allocation tranches are ledger-native (no legacy
      // counterpart) — excluded from the legacy↔ledger comparison
      let ledgerBalance = 0;
      if (account) {
        const grouped2 = await this.prisma.ledgerEntry.groupBy({
          by: ['direction'],
          where: {
            accountId: account.id,
            transaction: {
            status: 'posted',
            // NULL-safe exclusion: manual postings carry no referenceType
            OR: [{ referenceType: null }, { NOT: { referenceType: 'fund_allocation' } }],
          },
          },
          _sum: { amount: true },
        });
        const debit = Number(grouped2.find((g) => g.direction === 'debit')?._sum.amount ?? 0);
        const credit = Number(grouped2.find((g) => g.direction === 'credit')?._sum.amount ?? 0);
        ledgerBalance = Math.round((credit - debit) * 100) / 100;
      }
      results.push({ projectId: id, legacyNet, ledgerBalance, equal: legacyNet === ledgerBalance });
    }
    return results;
  }

  // ─── Controller flags (read+flag role; the flag is an audited event) ─────────

  async flagTransaction(actor: ActorContext, transactionId: number, reason: string) {
    const transaction = await this.prisma.ledgerTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new NotFoundException(`Ledger transaction #${transactionId} not found`);
    this.eventBus.publish({
      event: 'ledger.flagged',
      actor,
      subject: { type: 'ledger_transaction', id: transactionId },
      data: { reason },
    });
    return { flagged: true, transactionId, reason };
  }
}
