import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { ActorContextService } from '../../events/actor-context.storage';
import { TreasuryService } from '../treasury/treasury.service';
import {
  CreateBudgetDto, UpdateBudgetDto,
  CreateExpenseDto, UpdateExpenseDto, UpdateExpenseStatusDto,
  CreateTransactionDto,
} from './dto/financial.dto';
import { AdminRole, ExpenseStatus } from '@prisma/client';

@Injectable()
export class FinancialService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
    private treasury: TreasuryService,
    private actorContext: ActorContextService,
  ) {}

  private async getProjectBlockId(projectId: number): Promise<number> {
    await this.tenancy.assertProjectVisible(projectId); // W2-E3-S1
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    return project.blockId;
  }

  private async assertBlockExists(blockId: number) {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException(`Block #${blockId} not found`);
  }

  /**
   * BUG-5 fix: donations.service.updateStatus already restricts financial
   * officers to their assigned project; this module had no equivalent, so any
   * financial officer could create/update budgets, decide expenses, or post
   * manual transactions against a project they aren't assigned to.
   * Administrators are unrestricted (matches the donations.service check).
   */
  private async assertFinancialOfficerAssigned(projectId: number, adminId: number, adminRole: string) {
    if (adminRole !== AdminRole.financial_officer) return;
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project?.financialOfficerId !== adminId) {
      throw new ForbiddenException('You are not assigned to this project');
    }
  }

  // ─── Budgets ──────────────────────────────────────────────────────────────

  async findBudgets(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectBudget.findMany({
      where: { projectRefId: projectId },
      include: {
        block: { include: { translations: true } },
        expenses: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createBudget(projectId: number, dto: CreateBudgetDto, adminId: number, adminRole: string) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertFinancialOfficerAssigned(projectId, adminId, adminRole);
    await this.assertBlockExists(dto.blockId);

    return this.prisma.projectBudget.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
        blockId: dto.blockId,
        estimatedAmount: dto.estimatedAmount,
        approvedAmount: dto.approvedAmount,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateBudget(projectId: number, budgetId: number, dto: UpdateBudgetDto, adminId: number, adminRole: string) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertFinancialOfficerAssigned(projectId, adminId, adminRole);
    const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectRefId: projectId } });
    if (!budget) throw new NotFoundException(`Budget #${budgetId} not found`);

    const { blockId, ...rest } = dto;
    return this.prisma.projectBudget.update({
      where: { id: budgetId },
      data: rest,
      include: { block: { include: { translations: true } } },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async removeBudget(projectId: number, budgetId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectRefId: projectId } });
    if (!budget) throw new NotFoundException(`Budget #${budgetId} not found`);
    await this.prisma.projectBudget.delete({ where: { id: budgetId } });
  }

  // ─── Expenses ─────────────────────────────────────────────────────────────

  async findExpenses(projectId: number, budgetId?: number, status?: ExpenseStatus) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectExpense.findMany({
      where: {
        projectRefId: projectId,
        ...(budgetId ? { budgetId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        block: { include: { translations: true } },
        budget: { include: { block: { include: { translations: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExpense(actor: ActorContext, projectId: number, dto: CreateExpenseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    if (dto.budgetId) {
      const budget = await this.prisma.projectBudget.findFirst({ where: { id: dto.budgetId, projectRefId: projectId } });
      if (!budget) throw new NotFoundException(`Budget #${dto.budgetId} not found in this project`);
    }

    const expense = await this.prisma.projectExpense.create({
      data: {
        projectId: projectBlockId,
        projectRefId: projectId, // W2-E1-S2 dual-write (D1)
        blockId: dto.blockId,
        budgetId: dto.budgetId,
        amount: dto.amount,
        invoiceRef: dto.invoiceRef,
      },
      include: { block: { include: { translations: true } } },
    });

    this.eventBus.publish({
      event: 'expense.submitted',
      actor,
      subject: { type: 'expense', id: expense.id },
      data: { projectId, budgetId: dto.budgetId ?? null, amount: dto.amount },
    });

    return expense;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateExpense(projectId: number, expenseId: number, dto: UpdateExpenseDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectRefId: projectId } });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    if (expense.status === ExpenseStatus.approved) throw new BadRequestException('Approved expenses cannot be modified');

    const { blockId, ...rest } = dto;
    return this.prisma.projectExpense.update({
      where: { id: expenseId },
      data: rest,
      include: { block: { include: { translations: true } } },
    });
  }

  async updateExpenseStatus(
    actor: ActorContext,
    projectId: number,
    expenseId: number,
    dto: UpdateExpenseStatusDto,
    adminId: number,
    adminRole: string,
  ) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertFinancialOfficerAssigned(projectId, adminId, adminRole);
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectRefId: projectId } });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    if (expense.status !== ExpenseStatus.pending) throw new BadRequestException('Only pending expenses can be approved/rejected');

    const updated = await this.prisma.projectExpense.update({
      where: { id: expenseId },
      data: { status: dto.status },
    });

    if (dto.status === ExpenseStatus.approved && expense.budgetId) {
      // budgets are plans — the plan-tracking increment stays here; the money
      // fact (ledger debit + legacy journal dual-write) posts in Treasury
      await this.prisma.projectBudget.update({
        where: { id: expense.budgetId },
        data: { actualAmount: { increment: expense.amount } },
      });
    }

    if (dto.status === ExpenseStatus.approved || dto.status === ExpenseStatus.rejected) {
      // W5: awaited — Treasury posts before this request continues
      await this.eventBus.publishAndWait({
        event: dto.status === ExpenseStatus.approved ? 'expense.approved' : 'expense.rejected',
        actor,
        subject: { type: 'expense', id: expenseId },
        data: { projectId, budgetId: expense.budgetId, amount: Number(expense.amount) },
      });
    }

    return updated;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async removeExpense(projectId: number, expenseId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectRefId: projectId } });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    if (expense.status === ExpenseStatus.approved) throw new BadRequestException('Approved expenses cannot be deleted');
    await this.prisma.projectExpense.delete({ where: { id: expenseId } });
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async findTransactions(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);

    // W5-E8-S1: ledger-backed reads behind the cutover flag. The reconciliation
    // gate + dual-write keep both representations identical; rollback = flip
    // the flag (09 rule). Legacy journal reads retire in Wave 8.
    if (process.env.TREASURY_LEDGER_READS === 'true') {
      const account = await this.prisma.account.findFirst({
        where: { ownerType: 'project', ownerId: projectId },
      });
      if (account) {
        const entries = await this.prisma.ledgerEntry.findMany({
          where: { accountId: account.id, transaction: { status: 'posted' } },
          include: { transaction: true },
          orderBy: { id: 'desc' },
        });
        // legacy row shape, sourced from the ledger
        return entries.map((e) => ({
          id: e.id,
          projectId: projectBlockId,
          projectRefId: projectId,
          type:
            e.direction === 'credit'
              ? ('income' as const)
              : ('expense' as const),
          amount: e.amount,
          referenceType: e.transaction.referenceType,
          referenceId: e.transaction.referenceId,
          notes: e.transaction.description,
          createdAt: e.transaction.timestamp,
        }));
      }
    }

    return this.prisma.projectTransaction.findMany({
      where: { projectRefId: projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** W5: manual journal entries post through Treasury (ledger + legacy dual-write). */
  // eslint-disable-next-line require-actor-context -- actor resolved from ALS (currentOrSystem); endpoint signature kept for contract parity
  async createTransaction(projectId: number, dto: CreateTransactionDto, adminId: number, adminRole: string) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertFinancialOfficerAssigned(projectId, adminId, adminRole);
    const actor = this.actorContext.currentOrSystem();
    const [projectAccount, cash, external] = await Promise.all([
      this.treasury.projectAccount(projectId),
      this.treasury.platformAccount('cash'),
      this.treasury.platformAccount('external'),
    ]);
    const inbound = dto.type === 'income' || dto.type === 'adjustment';
    const counterparty = inbound ? cash : dto.type === 'refund' ? cash : external;
    const { transaction } = await this.treasury.post(actor, {
      description: dto.notes || `Manual ${dto.type} entry for project #${projectId}`,
      entries: inbound
        ? [
            { accountId: counterparty.id, direction: 'debit', amount: dto.amount },
            { accountId: projectAccount.id, direction: 'credit', amount: dto.amount },
          ]
        : [
            { accountId: projectAccount.id, direction: 'debit', amount: dto.amount },
            { accountId: counterparty.id, direction: 'credit', amount: dto.amount },
          ],
      legacyJournal: {
        projectBlockId,
        projectRefId: projectId,
        type: dto.type,
        notes: dto.notes,
      },
    });
    // legacy response shape: the journal row this posting appended
    return this.prisma.projectTransaction.findFirst({
      where: { projectRefId: projectId },
      orderBy: { id: 'desc' },
    });
  }

  async getSummary(projectId: number) {
    await this.getProjectBlockId(projectId); // tenancy visibility + not-found check (W2-E3-S1)

    const [{ totalIncome, totalExpense }, budgets] = await Promise.all([
      this.projectMoneyTotals(projectId),
      this.prisma.projectBudget.aggregate({
        where: { projectRefId: projectId },
        _sum: { estimatedAmount: true, approvedAmount: true, actualAmount: true },
      }),
    ]);

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      estimatedBudget: Number(budgets._sum.estimatedAmount ?? 0),
      approvedBudget: Number(budgets._sum.approvedAmount ?? 0),
      actualSpent: Number(budgets._sum.actualAmount ?? 0),
    };
  }

  /**
   * W9-stabilization: getSummary() unconditionally read the frozen
   * `ProjectTransaction` dual-write mirror while its sibling findTransactions()
   * (above) already branches on TREASURY_LEDGER_READS to read the real ledger —
   * same file, same money, two different answers once the flag flips on. Same
   * gate, same account lookup, applied here so both methods agree.
   */
  private async projectMoneyTotals(projectId: number): Promise<{ totalIncome: number; totalExpense: number }> {
    if (process.env.TREASURY_LEDGER_READS === 'true') {
      const account = await this.prisma.account.findFirst({
        where: { ownerType: 'project', ownerId: projectId },
      });
      if (account) {
        const grouped = await this.prisma.ledgerEntry.groupBy({
          by: ['direction'],
          where: { accountId: account.id, transaction: { status: 'posted' } },
          _sum: { amount: true },
        });
        return {
          totalIncome: Number(grouped.find((g) => g.direction === 'credit')?._sum.amount ?? 0),
          totalExpense: Number(grouped.find((g) => g.direction === 'debit')?._sum.amount ?? 0),
        };
      }
    }

    const [income, expense] = await Promise.all([
      this.prisma.projectTransaction.aggregate({
        where: { projectRefId: projectId, type: { in: ['income', 'adjustment'] } },
        _sum: { amount: true },
      }),
      this.prisma.projectTransaction.aggregate({
        where: { projectRefId: projectId, type: 'expense' },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalIncome: Number(income._sum.amount ?? 0),
      totalExpense: Number(expense._sum.amount ?? 0),
    };
  }
}
