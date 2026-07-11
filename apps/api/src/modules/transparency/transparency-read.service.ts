import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { PublicationPolicyService } from './publication-policy.service';

/** Every aggregate carries the moment it was computed (18: visible freshness). */
export interface Aggregate<T> {
  asOf: string;
  data: T;
}

const CACHE_TTL_MS = 60_000;

/** ledger referenceType → public channel label */
const INTAKE_LABEL: Record<string, string> = {
  donation: 'qr_cash_donations',
  online_donation: 'online_donations',
  fund_allocation: 'fund_allocations',
  legacy_transaction: 'legacy_income',
  spec_fixture: 'grants',
};
const SPEND_LABEL: Record<string, string> = {
  expense: 'project_expenses',
  legacy_transaction: 'legacy_spend',
};

/**
 * W7-E1-S1 — the transparency read layer: cached aggregates over the ledger,
 * workflow, governance, and category tables. Serves BOTH the public portal
 * and the internal dashboards (one source — public numbers can never disagree
 * with internal ones). No new domain truth; reads only.
 *
 * PRIVACY (W7-E1-S3, hard exclusion at query level): no query in this file
 * selects donor/participant/user identity columns or study section content —
 * the public layer cannot leak what it never reads.
 */
@Injectable()
export class TransparencyReadService {
  constructor(
    private prisma: PrismaService,
    private policy: PublicationPolicyService,
    private categories: CategoriesService,
  ) {}

  private cache = new Map<string, { at: number; value: Aggregate<unknown> }>();

  /** Event-driven refresh (W7-E1-S1 AC): money/lifecycle events clear the cache. */
  invalidate(): void {
    this.cache.clear();
  }

  private async cached<T>(key: string, compute: () => Promise<T>): Promise<Aggregate<T>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Aggregate<T>;
    const data = await compute();
    const value: Aggregate<T> = { asOf: new Date().toISOString(), data };
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  // ─── Platform statistics (W7-E2-S3) ─────────────────────────────────────────

  platformStats() {
    return this.cached('platform-stats', async () => {
      const [categoryGroups, categories, instances, orgGroups, cashIntake, onlineProject, onlineFund, manualFund] =
        await Promise.all([
          this.prisma.project.groupBy({ by: ['categoryId'], _count: { id: true }, _sum: { value: true } }),
          this.prisma.projectCategoryNode.findMany({
            select: { id: true, key: true, name: true, nameAr: true, nameFr: true },
          }),
          this.prisma.workflowInstance.groupBy({
            by: ['currentStateKey'],
            where: { subjectType: 'project' },
            _count: { id: true },
          }),
          this.prisma.organization.groupBy({
            by: ['type'],
            where: { status: 'active', deletedAt: null },
            _count: { id: true },
          }),
          this.prisma.projectDonation.aggregate({ where: { status: 'approved' }, _sum: { amount: true }, _count: { id: true } }),
          this.prisma.onlineDonation.aggregate({
            where: { status: 'completed', projectId: { not: null } },
            _sum: { amount: true },
            _count: { id: true },
          }),
          this.prisma.onlineDonation.aggregate({
            where: { status: 'completed', fundId: { not: null } },
            _sum: { amount: true },
            _count: { id: true },
          }),
          // W9-stabilization: offline/manual donations recorded straight against a fund
          // (Donor/participant cash, check, wire) — same channel sectorPublic() already
          // includes; platformStats() previously omitted it, undercounting platform intake.
          this.prisma.fundDonation.aggregate({
            where: { status: 'approved' },
            _sum: { amount: true },
            _count: { id: true },
          }),
        ]);

      const categoryOf = new Map(categories.map((c) => [c.id, c]));
      return {
        projectsByCategory: categoryGroups.map((g) => ({
          category: g.categoryId != null ? categoryOf.get(g.categoryId) ?? null : null,
          projects: g._count.id,
          targetValue: Number(g._sum.value ?? 0),
        })),
        projectsByState: Object.fromEntries(instances.map((i) => [i.currentStateKey, i._count.id])),
        organizationsByType: Object.fromEntries(orgGroups.map((o) => [o.type, o._count.id])),
        intakeByChannel: {
          qr_cash_donations: { count: cashIntake._count.id, amount: Number(cashIntake._sum.amount ?? 0) },
          online_project_donations: { count: onlineProject._count.id, amount: Number(onlineProject._sum.amount ?? 0) },
          online_fund_donations: { count: onlineFund._count.id, amount: Number(onlineFund._sum.amount ?? 0) },
          fund_donations: { count: manualFund._count.id, amount: Number(manualFund._sum.amount ?? 0) },
        },
        funds: await this.fundsOverviewData(),
      };
    });
  }

  /** Total platform intake across every donation channel — the one number "total collected" means. */
  static totalIntake(intakeByChannel: Record<string, { amount: number }>): number {
    return round2(Object.values(intakeByChannel).reduce((sum, c) => sum + c.amount, 0));
  }

  // ─── Funds (W7-E2-S1) ────────────────────────────────────────────────────────

  fundsOverview() {
    return this.cached('funds-overview', () => this.fundsOverviewData());
  }

  private async fundsOverviewData() {
    const funds = await this.prisma.fund.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, purpose: true, status: true },
    });
    return Promise.all(
      funds.map(async (fund) => ({ ...fund, ...(await this.fundMoney(fund.id)) })),
    );
  }

  fundPublic(fundId: number) {
    return this.cached(`fund-${fundId}`, async () => {
      const fund = await this.prisma.fund.findFirst({
        where: { id: fundId, deletedAt: null },
        select: { id: true, name: true, purpose: true, status: true, createdAt: true },
      });
      if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);

      const money = await this.fundMoney(fundId);
      const allocations = await this.prisma.fundAllocation.findMany({
        where: { fundId, status: { notIn: ['rejected'] } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          project: {
            select: {
              id: true,
              categoryNode: { select: { key: true, name: true, nameAr: true, nameFr: true } },
              block: { select: { translations: { select: { languageCode: true, name: true } } } },
            },
          },
        },
      });
      const disbursedByAllocation = await this.disbursedByAllocation(allocations.map((a) => a.id));

      const spendByCategory = new Map<string, { category: unknown; allocated: number; disbursed: number }>();
      for (const allocation of allocations) {
        const key = allocation.project.categoryNode?.key ?? 'uncategorized';
        const bucket = spendByCategory.get(key) ?? {
          category: allocation.project.categoryNode ?? null,
          allocated: 0,
          disbursed: 0,
        };
        bucket.allocated += Number(allocation.amount);
        bucket.disbursed += disbursedByAllocation.get(allocation.id) ?? 0;
        spendByCategory.set(key, bucket);
      }

      return {
        ...fund,
        ...money,
        allocations: allocations.map((a) => ({
          id: a.id,
          amount: Number(a.amount),
          disbursed: disbursedByAllocation.get(a.id) ?? 0,
          status: a.status,
          createdAt: a.createdAt,
          project: {
            id: a.project.id,
            name: a.project.block.translations[0]?.name ?? `#${a.project.id}`,
            names: a.project.block.translations,
            category: a.project.categoryNode,
          },
        })),
        spendByCategory: [...spendByCategory.values()],
      };
    });
  }

  /** Monthly intake/outflow series for trend views (W7-E3-S2). */
  fundTrends(fundId: number) {
    return this.cached(`fund-trends-${fundId}`, async () => {
      const account = await this.prisma.account.findFirst({ where: { ownerType: 'fund', ownerId: fundId } });
      if (!account) return [];
      const entries = await this.prisma.ledgerEntry.findMany({
        where: { accountId: account.id, transaction: { status: 'posted' } },
        select: { direction: true, amount: true, transaction: { select: { timestamp: true } } },
      });
      const months = new Map<string, { month: string; intake: number; outflow: number }>();
      for (const entry of entries) {
        const month = entry.transaction.timestamp.toISOString().slice(0, 7);
        const bucket = months.get(month) ?? { month, intake: 0, outflow: 0 };
        if (entry.direction === 'credit') bucket.intake += Number(entry.amount);
        else bucket.outflow += Number(entry.amount);
        months.set(month, bucket);
      }
      return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    });
  }

  // ─── Projects (W7-E2-S2: funding sources + the money trail) ─────────────────

  projectPublic(projectId: number) {
    return this.cached(`project-${projectId}`, async () => {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          id: true,
          value: true,
          progression: true,
          isCompleted: true,
          categoryNode: { select: { key: true, name: true, nameAr: true, nameFr: true, parentId: true } },
          ownerOrganization: { select: { id: true, name: true, type: true, verifiedAt: true } },
        },
      });
      if (!project) throw new NotFoundException(`Project #${projectId} not found`);

      const [cash, online, allocations, instance, milestones, decisions, study] = await Promise.all([
        this.prisma.projectDonation.aggregate({
          where: { projectId, status: 'approved' },
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.onlineDonation.aggregate({
          where: { projectId, status: 'completed' },
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.fundAllocation.findMany({
          where: { projectId, status: { notIn: ['rejected', 'proposed'] } },
          select: { id: true, amount: true, status: true, fund: { select: { id: true, name: true } } },
        }),
        this.prisma.workflowInstance.findUnique({
          where: { subjectType_subjectId: { subjectType: 'project', subjectId: projectId } },
          include: { definition: { select: { key: true, version: true } } },
        }),
        this.prisma.projectMilestone.groupBy({
          by: ['status'],
          where: { projectRefId: projectId, deletedAt: null },
          _count: { id: true },
        }),
        this.decisionsForProject(projectId),
        this.prisma.projectStudy.findUnique({ where: { projectId }, select: { id: true, status: true } }),
      ]);
      const disbursedByAllocation = await this.disbursedByAllocation(allocations.map((a) => a.id));

      return {
        id: project.id,
        category: project.categoryNode,
        owner: {
          id: project.ownerOrganization.id,
          name: project.ownerOrganization.name,
          type: project.ownerOrganization.type,
          verified: project.ownerOrganization.verifiedAt != null,
        },
        funding: {
          target: Number(project.value),
          progression: Number(project.progression),
          isCompleted: project.isCompleted,
          byChannel: {
            qr_cash_donations: { count: cash._count.id, amount: Number(cash._sum.amount ?? 0) },
            online_donations: { count: online._count.id, amount: Number(online._sum.amount ?? 0) },
          },
          allocations: allocations.map((a) => ({
            fund: a.fund,
            amount: Number(a.amount),
            disbursed: disbursedByAllocation.get(a.id) ?? 0,
            status: a.status,
          })),
        },
        lifecycle: instance
          ? { definition: instance.definition.key, version: instance.definition.version, state: instance.currentStateKey }
          : null,
        studyStatus: study?.status ?? null,
        milestones: Object.fromEntries(milestones.map((m) => [m.status, m._count.id])),
        decisions,
        moneyTrail: await this.moneyTrail(projectId),
      };
    });
  }

  /** The headline chain (18): intake → project account credit → spend category. */
  private async moneyTrail(projectId: number) {
    const account = await this.prisma.account.findFirst({
      where: { ownerType: 'project', ownerId: projectId },
    });
    if (!account) return { intake: [], spend: [], balance: 0 };
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId: account.id, transaction: { status: 'posted' } },
      select: { direction: true, amount: true, transaction: { select: { referenceType: true } } },
    });
    const intake = new Map<string, number>();
    const spend = new Map<string, number>();
    let balance = 0;
    for (const entry of entries) {
      const amount = Number(entry.amount);
      const ref = entry.transaction.referenceType ?? 'other';
      if (entry.direction === 'credit') {
        balance += amount;
        const label = INTAKE_LABEL[ref] ?? ref;
        intake.set(label, (intake.get(label) ?? 0) + amount);
      } else {
        balance -= amount;
        const label = SPEND_LABEL[ref] ?? ref;
        spend.set(label, (spend.get(label) ?? 0) + amount);
      }
    }
    return {
      intake: [...intake.entries()].map(([source, amount]) => ({ source, amount: round2(amount) })),
      spend: [...spend.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })),
      balance: round2(balance),
    };
  }

  /** Decision registry entries for a project + its study — no member identities. */
  private async decisionsForProject(projectId: number) {
    const study = await this.prisma.projectStudy.findUnique({
      where: { projectId },
      select: { id: true },
    });
    const decisions = await this.prisma.boardDecision.findMany({
      where: {
        OR: [
          { subjectType: 'project', subjectId: projectId },
          ...(study ? [{ subjectType: 'project_study' as const, subjectId: study.id }] : []),
        ],
      },
      orderBy: { decidedAt: 'asc' },
      select: { decision: true, rationale: true, decidedAt: true, subjectType: true },
    });
    return decisions.map((d) => ({ ...d, decidedBy: 'Board' }));
  }

  // ─── Organizations (W7-E2-S1) ────────────────────────────────────────────────

  organizationsDirectory() {
    return this.cached('orgs-directory', async () => {
      const orgs = await this.prisma.organization.findMany({
        where: { status: 'active', deletedAt: null, type: { not: 'board' } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          verifiedAt: true,
          _count: { select: { ownedProjects: true } },
        },
      });
      return orgs.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        verified: o.verifiedAt != null,
        projects: o._count.ownedProjects,
      }));
    });
  }

  orgPublic(orgId: number) {
    return this.cached(`org-${orgId}`, async () => {
      const org = await this.prisma.organization.findFirst({
        where: { id: orgId, deletedAt: null, status: 'active' },
        select: {
          id: true,
          name: true,
          type: true,
          verifiedAt: true,
          createdAt: true,
          contentBlock: { select: { translations: { select: { languageCode: true, name: true, brief: true, description: true } } } },
        },
      });
      if (!org) throw new NotFoundException(`Organization #${orgId} not found`);

      // eslint-disable-next-line no-unscoped-org-reads -- public read layer: explicitly scoped to the requested org; serves only policy-cleared aggregate fields
      const projects = await this.prisma.project.findMany({
        where: { ownerOrganizationId: orgId, deletedAt: null },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          value: true,
          progression: true,
          isCompleted: true,
          categoryNode: { select: { key: true, name: true, nameAr: true, nameFr: true } },
          block: { select: { translations: { select: { languageCode: true, name: true, slug: true } } } },
          donations: { where: { status: 'approved' }, select: { amount: true } },
        },
      });

      const portfolio = projects.map((p) => ({
        id: p.id,
        names: p.block.translations,
        category: p.categoryNode,
        target: Number(p.value),
        collected: round2(p.donations.reduce((s, d) => s + Number(d.amount), 0)),
        progression: Number(p.progression),
        isCompleted: p.isCompleted,
      }));

      return {
        id: org.id,
        name: org.name,
        type: org.type,
        verified: org.verifiedAt != null,
        verifiedAt: org.verifiedAt,
        memberSince: org.createdAt,
        profile: org.contentBlock?.translations ?? [],
        portfolio,
        totals: {
          projects: portfolio.length,
          completed: portfolio.filter((p) => p.isCompleted).length,
          targetValue: round2(portfolio.reduce((s, p) => s + p.target, 0)),
          collected: round2(portfolio.reduce((s, p) => s + p.collected, 0)),
        },
      };
    });
  }

  // ─── Sectors (W9 — spec §11 "Sector reports") ───────────────────────────────

  /**
   * Rolls a category node and all its descendants up into one sector report:
   * donations received (project cash/online + fund manual/online), amount
   * allocated/spent/remaining across every fund scoped to the sector, and its
   * active projects. Same money sources `fundMoney`/platformStats already
   * read — no new domain truth, just a different grouping.
   */
  sectorPublic(categoryId: number) {
    return this.cached(`sector-${categoryId}`, async () => {
      const category = await this.prisma.projectCategoryNode.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException(`Category #${categoryId} not found`);
      const ids = await this.categories.selfAndDescendantIds(categoryId);

      const funds = await this.prisma.fund.findMany({
        where: { categoryId: { in: ids }, deletedAt: null },
        select: { id: true, name: true, type: true },
      });
      const fundMoneys = await Promise.all(funds.map(async (f) => ({ fund: f, ...(await this.fundMoney(f.id)) })));

      const [projectCash, projectOnline, fundOnline, fundManual, expenses, activeProjects, totalProjectCount] =
        await Promise.all([
          this.prisma.projectDonation.aggregate({
            where: { status: 'approved', project: { categoryId: { in: ids } } },
            _sum: { amount: true },
          }),
          this.prisma.onlineDonation.aggregate({
            where: { status: 'completed', project: { categoryId: { in: ids } } },
            _sum: { amount: true },
          }),
          this.prisma.onlineDonation.aggregate({
            where: { status: 'completed', fund: { categoryId: { in: ids } } },
            _sum: { amount: true },
          }),
          this.prisma.fundDonation.aggregate({
            where: { status: 'approved', fund: { categoryId: { in: ids } } },
            _sum: { amount: true },
          }),
          this.prisma.expense.aggregate({
            where: { status: 'approved', fund: { categoryId: { in: ids } } },
            _sum: { amount: true },
          }),
          this.prisma.project.findMany({
            where: { categoryId: { in: ids }, isCompleted: false, deletedAt: null },
            select: { id: true, value: true, block: { select: { translations: { take: 1 } } } },
          }),
          this.prisma.project.count({ where: { categoryId: { in: ids }, deletedAt: null } }),
        ]);

      const totalDonations = round2(
        Number(projectCash._sum.amount ?? 0) +
          Number(projectOnline._sum.amount ?? 0) +
          Number(fundOnline._sum.amount ?? 0) +
          Number(fundManual._sum.amount ?? 0),
      );

      return {
        category: { id: category.id, key: category.key, name: category.name, nameAr: category.nameAr, nameFr: category.nameFr },
        totalDonations,
        totalAllocated: round2(fundMoneys.reduce((s, f) => s + f.allocated, 0)),
        totalSpent: round2(fundMoneys.reduce((s, f) => s + f.disbursed, 0) + Number(expenses._sum.amount ?? 0)),
        remainingBalance: round2(fundMoneys.reduce((s, f) => s + f.balance, 0)),
        totalProjects: totalProjectCount,
        activeProjects: activeProjects.map((p) => ({
          id: p.id,
          name: p.block.translations[0]?.name ?? `#${p.id}`,
          value: Number(p.value),
        })),
        funds: fundMoneys.map((f) => ({ id: f.fund.id, name: f.fund.name, type: f.fund.type, balance: f.balance })),
      };
    });
  }

  // ─── Decision registry ───────────────────────────────────────────────────────

  decisionRegistry(limit = 100) {
    return this.cached(`decisions-${limit}`, async () => {
      const decisions = await this.prisma.boardDecision.findMany({
        orderBy: { decidedAt: 'desc' },
        take: limit,
        select: { id: true, subjectType: true, subjectId: true, decision: true, rationale: true, decidedAt: true },
      });
      return decisions.map((d) => ({ ...d, decidedBy: 'Board' }));
    });
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async fundMoney(fundId: number) {
    const account = await this.prisma.account.findFirst({ where: { ownerType: 'fund', ownerId: fundId } });
    if (!account) return { balance: 0, intake: 0, allocated: 0, disbursed: 0 };
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId: account.id, transaction: { status: 'posted' } },
      select: { direction: true, amount: true },
    });
    let intake = 0;
    let outflow = 0;
    for (const entry of entries) {
      if (entry.direction === 'credit') intake += Number(entry.amount);
      else outflow += Number(entry.amount);
    }
    const allocatedAgg = await this.prisma.fundAllocation.aggregate({
      where: { fundId, status: { notIn: ['rejected', 'proposed'] } },
      _sum: { amount: true },
    });
    return {
      balance: round2(intake - outflow),
      intake: round2(intake),
      allocated: Number(allocatedAgg._sum.amount ?? 0),
      disbursed: round2(outflow),
    };
  }

  private async disbursedByAllocation(allocationIds: number[]): Promise<Map<number, number>> {
    if (allocationIds.length === 0) return new Map();
    const transactions = await this.prisma.ledgerTransaction.findMany({
      where: { referenceType: 'fund_allocation', referenceId: { in: allocationIds }, status: 'posted' },
      include: { entries: true },
    });
    const map = new Map<number, number>();
    for (const t of transactions) {
      const credits = t.entries
        .filter((e) => e.direction === 'credit')
        .reduce((s, e) => s + Number(e.amount), 0);
      map.set(t.referenceId!, round2((map.get(t.referenceId!) ?? 0) + credits));
    }
    return map;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
