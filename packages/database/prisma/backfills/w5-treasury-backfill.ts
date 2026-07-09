import { Prisma, PrismaClient } from '@prisma/client';

/**
 * W5-E4 — treasury backfill (idempotent, re-runnable).
 *
 * S1: platform accounts (physical cash intake, Stripe/PayPal clearing,
 *     external counterparties) + one account per project (and per fund).
 * S2: ledger reconstruction from `ProjectTransaction` with a WRITTEN
 *     derivation rule per type:
 *       income/adjustment → debit cash intake,  credit project account
 *       expense           → debit project,      credit external counterparties
 *       refund            → debit project,      credit cash intake
 *     Every reconstructed row is keyed (project_transaction, rowId,
 *     legacy.import) — precise idempotency, no collision with live postings.
 *     Residue is impossible by construction (reconstruction is total), but the
 *     reconciliation gate verifies it anyway.
 *
 * Reconciliation gate: `legacy journal net = ledger account balance` must
 * hold EXACTLY for 100% of projects — the seed hard-fails otherwise.
 */

const PLATFORM_ACCOUNTS = [
  { ownerType: 'provider_clearing', name: 'Physical Cash Intake', kind: 'asset' },
  { ownerType: 'provider_clearing', name: 'Stripe Clearing', kind: 'asset' },
  { ownerType: 'provider_clearing', name: 'PayPal Clearing', kind: 'asset' },
  { ownerType: 'external', name: 'External Counterparties', kind: 'expense' },
] as const;

export interface TreasuryBackfillResult {
  accountsCreated: number;
  transactionsReconstructed: number;
  reconciliation: { projectsChecked: number; mismatches: string[] };
}

export async function backfillTreasury(prisma: PrismaClient): Promise<TreasuryBackfillResult> {
  let accountsCreated = 0;
  let transactionsReconstructed = 0;

  // ── S1: platform accounts ──
  for (const spec of PLATFORM_ACCOUNTS) {
    const existing = await prisma.account.findFirst({
      where: { ownerType: spec.ownerType, name: spec.name, currency: 'USD' },
    });
    if (!existing) {
      await prisma.account.create({
        data: { ownerType: spec.ownerType, ownerId: null, name: spec.name, kind: spec.kind, currency: 'USD' },
      });
      accountsCreated += 1;
    }
  }
  const cash = (await prisma.account.findFirst({ where: { name: 'Physical Cash Intake' } }))!;
  const external = (await prisma.account.findFirst({ where: { name: 'External Counterparties' } }))!;

  // ── S1: per-project accounts ──
  const projects = await prisma.project.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const projectAccounts = new Map<number, number>();
  for (const { id } of projects) {
    let account = await prisma.account.findFirst({ where: { ownerType: 'project', ownerId: id, currency: 'USD' } });
    if (!account) {
      account = await prisma.account.create({
        data: { ownerType: 'project', ownerId: id, name: `Project #${id}`, kind: 'liability', currency: 'USD' },
      });
      accountsCreated += 1;
    }
    projectAccounts.set(id, account.id);
  }

  // ── S1: per-fund accounts ──
  const funds = await prisma.fund.findMany({ select: { id: true, name: true } });
  for (const fund of funds) {
    const existing = await prisma.account.findFirst({ where: { ownerType: 'fund', ownerId: fund.id, currency: 'USD' } });
    if (!existing) {
      await prisma.account.create({
        data: { ownerType: 'fund', ownerId: fund.id, name: `Fund: ${fund.name}`, kind: 'liability', currency: 'USD' },
      });
      accountsCreated += 1;
    }
  }

  // ── S2: ledger reconstruction ──
  // Only projects with NO ledger activity are reconstructed: this is the
  // one-shot migration of pure-legacy history. Projects already living in
  // the dual-write world (any posting on their account) are in lockstep by
  // construction — re-importing their legacy rows would double-count.
  const reconstructedProjects = new Set<number>();
  for (const [pid, accountId] of projectAccounts) {
    const activity = await prisma.ledgerEntry.count({ where: { accountId } });
    if (activity === 0) reconstructedProjects.add(pid);
  }

  const rows = await prisma.projectTransaction.findMany({ orderBy: { id: 'asc' } });
  for (const row of rows) {
    if (row.projectRefId == null) continue; // D1 backfill guarantees this; belt and suspenders
    if (!reconstructedProjects.has(row.projectRefId)) continue;
    const exists = await prisma.ledgerTransaction.findFirst({
      where: { referenceType: 'project_transaction', referenceId: row.id, event: 'legacy.import' },
    });
    if (exists) continue;
    const projectAccountId = projectAccounts.get(row.projectRefId);
    if (!projectAccountId) continue;

    const inbound = row.type === 'income' || row.type === 'adjustment';
    const counterpartyId = inbound ? cash.id : row.type === 'refund' ? cash.id : external.id;
    const [debitAccount, creditAccount] = inbound
      ? [counterpartyId, projectAccountId]
      : [projectAccountId, counterpartyId];

    await prisma.ledgerTransaction.create({
      data: {
        timestamp: row.createdAt,
        description: `Legacy journal import: ${row.type}${row.notes ? ` — ${row.notes}` : ''}`,
        referenceType: 'project_transaction',
        referenceId: row.id,
        event: 'legacy.import',
        entries: {
          create: [
            { accountId: debitAccount, direction: 'debit', amount: new Prisma.Decimal(row.amount), currency: 'USD' },
            { accountId: creditAccount, direction: 'credit', amount: new Prisma.Decimal(row.amount), currency: 'USD' },
          ],
        },
      },
    });
    transactionsReconstructed += 1;
  }

  return {
    accountsCreated,
    transactionsReconstructed,
    reconciliation: await reconcileTreasury(prisma),
  };
}

/** The E4 gate: legacy net must equal ledger balance for every project. */
export async function reconcileTreasury(
  prisma: PrismaClient,
): Promise<{ projectsChecked: number; mismatches: string[] }> {
  const mismatches: string[] = [];
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const { id } of projects) {
    const grouped = await prisma.projectTransaction.groupBy({
      by: ['type'],
      where: { projectRefId: id },
      _sum: { amount: true },
    });
    const of = (t: string) => Number(grouped.find((g) => g.type === t)?._sum.amount ?? 0);
    const legacyNet = Math.round((of('income') + of('adjustment') - of('expense') - of('refund')) * 100) / 100;

    const account = await prisma.account.findFirst({ where: { ownerType: 'project', ownerId: id } });
    let ledgerBalance = 0;
    if (account) {
      // Allocations are ledger-NATIVE (fund→project tranches have no legacy
      // journal counterpart) — the reconciliation gate compares only the
      // migrated/dual-written representations. During the dual-write era every
      // other project-account posting must carry a legacyJournal row.
      const entries = await prisma.ledgerEntry.groupBy({
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
      const debit = Number(entries.find((e) => e.direction === 'debit')?._sum.amount ?? 0);
      const credit = Number(entries.find((e) => e.direction === 'credit')?._sum.amount ?? 0);
      ledgerBalance = Math.round((credit - debit) * 100) / 100; // project accounts are liability-kind
    }
    if (legacyNet !== ledgerBalance) {
      mismatches.push(`project ${id}: legacy net ${legacyNet} ≠ ledger ${ledgerBalance}`);
    }
  }
  return { projectsChecked: projects.length, mismatches };
}
