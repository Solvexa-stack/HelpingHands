import { Injectable, NotFoundException } from '@nestjs/common';
import { Fund, Prisma } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TreasuryService } from '../treasury/treasury.service';

export interface FundTreeNode extends Fund {
  balance: number;
  children: FundTreeNode[];
  projects: Array<{ id: number; name: string; value: number }>;
}

/**
 * W9 — the fund hierarchy: Master Fund (one per ProjectCategoryNode, mirrors
 * the taxonomy's own parent/child structure 1:1) → Organization Fund (one
 * per organization × category, parented under that category's master fund).
 *
 * Idempotent find-or-create throughout (same idiom as
 * TreasuryService.ensureAccount) — callers never need to check "does this
 * fund already exist" themselves. A partial unique index on the funds table
 * is the DB-level backstop against a create-race producing duplicates (see
 * the w9_fund_hierarchy_dedup_indexes migration).
 *
 * Deliberately does NOT own the "route a direct donation through the
 * project's default fund" posting logic — that is money movement, belongs
 * with the rest of MoneyEventsSubscriber's postings (same file as
 * donation.approved/expense.approved), and pulling it in here would have
 * made this module and TreasuryModule import each other.
 */
@Injectable()
export class FundHierarchyService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private treasury: TreasuryService,
  ) {}

  /** The category's master fund, creating it (and any ancestor master funds) on first use. */
  async ensureMasterFund(actor: ActorContext, categoryId: number): Promise<Fund> {
    const existing = await this.prisma.fund.findFirst({
      where: { type: 'master', categoryId, deletedAt: null },
    });
    if (existing) return existing;

    const category = await this.prisma.projectCategoryNode.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);

    // Mirror the taxonomy's own nesting: Water's master fund sits under
    // Infrastructure's master fund, exactly like the category nodes do.
    const parentFundId =
      category.parentId != null ? (await this.ensureMasterFund(actor, category.parentId)).id : undefined;

    const fund = await this.prisma.fund.create({
      data: {
        name: `${category.name} Master Fund`,
        type: 'master',
        categoryId,
        parentFundId,
        policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue,
      },
    });
    await this.treasury.fundAccount(fund.id, fund.name);
    this.eventBus.publish({
      event: 'fund.created',
      actor,
      subject: { type: 'fund', id: fund.id },
      data: { name: fund.name, type: fund.type, auto: true, categoryId },
    });
    return fund;
  }

  /** The organization's fund for this category, creating it (and its master fund) on first use. */
  async ensureOrganizationFund(actor: ActorContext, organizationId: number, categoryId: number): Promise<Fund> {
    const existing = await this.prisma.fund.findFirst({
      where: { type: 'organization', categoryId, managingOrganizationId: organizationId, deletedAt: null },
    });
    if (existing) return existing;

    const [master, org, category] = await Promise.all([
      this.ensureMasterFund(actor, categoryId),
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.projectCategoryNode.findUnique({ where: { id: categoryId } }),
    ]);
    if (!org) throw new NotFoundException(`Organization #${organizationId} not found`);
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);

    const fund = await this.prisma.fund.create({
      data: {
        name: `${org.name} ${category.name} Fund`,
        type: 'organization',
        categoryId,
        managingOrganizationId: organizationId,
        parentFundId: master.id,
        policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue,
      },
    });
    await this.treasury.fundAccount(fund.id, fund.name);
    this.eventBus.publish({
      event: 'fund.created',
      actor,
      subject: { type: 'fund', id: fund.id },
      data: { name: fund.name, type: fund.type, auto: true, categoryId, organizationId },
    });
    return fund;
  }

  /**
   * The hierarchy for the admin UI: master funds at the root (nested per the
   * taxonomy), their child organization/council/donor funds, and the
   * projects each fund is the default fund for. Pre-W9 flat funds (no
   * category, no parent) are returned separately so nothing already in the
   * system silently disappears from the view.
   */
  async tree(): Promise<{ roots: FundTreeNode[]; unattached: FundTreeNode[] }> {
    const funds = await this.prisma.fund.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
    const projects = await this.prisma.project.findMany({
      where: { primaryFundId: { not: null }, deletedAt: null },
      select: {
        id: true,
        primaryFundId: true,
        value: true,
        block: { include: { translations: { take: 1 } } },
      },
    });

    const withBalances = await Promise.all(
      funds.map(async (fund) => ({ ...fund, balance: await this.fundBalance(fund.id), children: [], projects: [] }) as FundTreeNode),
    );
    const nodes = new Map<number, FundTreeNode>(withBalances.map((n) => [n.id, n]));
    for (const project of projects) {
      const node = nodes.get(project.primaryFundId!);
      if (node) {
        node.projects.push({
          id: project.id,
          name: project.block.translations[0]?.name ?? `Project #${project.id}`,
          value: Number(project.value),
        });
      }
    }

    const roots: FundTreeNode[] = [];
    const unattached: FundTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentFundId != null && nodes.has(node.parentFundId)) {
        nodes.get(node.parentFundId)!.children.push(node);
      } else if (node.type === 'master') {
        roots.push(node);
      } else {
        unattached.push(node);
      }
    }
    return { roots, unattached };
  }

  private async fundBalance(fundId: number): Promise<number> {
    const account = await this.prisma.account.findFirst({ where: { ownerType: 'fund', ownerId: fundId } });
    return account ? this.treasury.balance(account.id) : 0;
  }

  /**
   * W9 — read-only "what would fund this project" preview for the project
   * creation flow (Step 2 of the spec's project-creation workflow: "System
   * suggests available funds"). Never creates anything — the master/org
   * funds are still lazily created on first use by `create()` (project
   * creation, via ensureOrganizationFund) or an explicit Super Admin action,
   * never by a read. `otherFunds` surfaces council/donor funds already
   * scoped to this sector (or an ancestor) as additional, optional sources —
   * the spec's "Council Funds" / "Donor Funds" as alternative funding.
   */
  async suggestedFunds(categoryId: number, organizationId?: number) {
    const category = await this.prisma.projectCategoryNode.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);

    const ancestorIds: number[] = [categoryId];
    let current = category;
    while (current.parentId != null) {
      const parent = await this.prisma.projectCategoryNode.findUnique({ where: { id: current.parentId } });
      if (!parent) break;
      ancestorIds.push(parent.id);
      current = parent;
    }

    const [masterFund, organizationFund, otherFunds] = await Promise.all([
      this.prisma.fund.findFirst({ where: { type: 'master', categoryId, deletedAt: null, status: 'active' } }),
      organizationId != null
        ? this.prisma.fund.findFirst({
            where: { type: 'organization', categoryId, managingOrganizationId: organizationId, deletedAt: null, status: 'active' },
          })
        : Promise.resolve(null),
      this.prisma.fund.findMany({
        where: { type: { in: ['council', 'donor'] }, categoryId: { in: ancestorIds }, deletedAt: null, status: 'active' },
        select: { id: true, name: true, type: true, categoryId: true },
      }),
    ]);

    return {
      category: { id: category.id, key: category.key, name: category.name },
      masterFund: masterFund ? { id: masterFund.id, name: masterFund.name, type: masterFund.type } : null,
      organizationFund: organizationFund
        ? { id: organizationFund.id, name: organizationFund.name, type: organizationFund.type }
        : null,
      otherFunds,
    };
  }
}
