import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import {
  CreateBudgetDto, UpdateBudgetDto,
  CreateExpenseDto, UpdateExpenseDto, UpdateExpenseStatusDto,
  CreateTransactionDto,
} from './dto/financial.dto';
import { ExpenseStatus } from '@prisma/client';

@Injectable()
export class FinancialService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  private async getProjectBlockId(projectId: number): Promise<number> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    return project.blockId;
  }

  private async assertBlockExists(blockId: number) {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException(`Block #${blockId} not found`);
  }

  // ─── Budgets ──────────────────────────────────────────────────────────────

  async findBudgets(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectBudget.findMany({
      where: { projectId: projectBlockId },
      include: {
        block: { include: { translations: true } },
        expenses: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createBudget(projectId: number, dto: CreateBudgetDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    await this.assertBlockExists(dto.blockId);

    return this.prisma.projectBudget.create({
      data: {
        projectId: projectBlockId,
        blockId: dto.blockId,
        estimatedAmount: dto.estimatedAmount,
        approvedAmount: dto.approvedAmount,
      },
      include: { block: { include: { translations: true } } },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateBudget(projectId: number, budgetId: number, dto: UpdateBudgetDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectId: projectBlockId } });
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
    const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, projectId: projectBlockId } });
    if (!budget) throw new NotFoundException(`Budget #${budgetId} not found`);
    await this.prisma.projectBudget.delete({ where: { id: budgetId } });
  }

  // ─── Expenses ─────────────────────────────────────────────────────────────

  async findExpenses(projectId: number, budgetId?: number, status?: ExpenseStatus) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectExpense.findMany({
      where: {
        projectId: projectBlockId,
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
      const budget = await this.prisma.projectBudget.findFirst({ where: { id: dto.budgetId, projectId: projectBlockId } });
      if (!budget) throw new NotFoundException(`Budget #${dto.budgetId} not found in this project`);
    }

    const expense = await this.prisma.projectExpense.create({
      data: {
        projectId: projectBlockId,
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
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
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
  ) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    if (expense.status !== ExpenseStatus.pending) throw new BadRequestException('Only pending expenses can be approved/rejected');

    const updated = await this.prisma.projectExpense.update({
      where: { id: expenseId },
      data: { status: dto.status },
    });

    if (dto.status === ExpenseStatus.approved) {
      await this.prisma.$transaction([
        this.prisma.projectTransaction.create({
          data: {
            projectId: projectBlockId,
            type: 'expense',
            amount: expense.amount,
            referenceType: 'expense',
            referenceId: expenseId,
          },
        }),
        ...(expense.budgetId
          ? [
              this.prisma.projectBudget.update({
                where: { id: expense.budgetId },
                data: { actualAmount: { increment: expense.amount } },
              }),
            ]
          : []),
      ]);
    }

    // Emit after the ledger transaction has committed
    if (dto.status === ExpenseStatus.approved || dto.status === ExpenseStatus.rejected) {
      this.eventBus.publish({
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
    const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId: projectBlockId } });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    if (expense.status === ExpenseStatus.approved) throw new BadRequestException('Approved expenses cannot be deleted');
    await this.prisma.projectExpense.delete({ where: { id: expenseId } });
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async findTransactions(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectTransaction.findMany({
      where: { projectId: projectBlockId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createTransaction(projectId: number, dto: CreateTransactionDto) {
    const projectBlockId = await this.getProjectBlockId(projectId);
    return this.prisma.projectTransaction.create({
      data: {
        projectId: projectBlockId,
        type: dto.type,
        amount: dto.amount,
        notes: dto.notes,
      },
    });
  }

  async getSummary(projectId: number) {
    const projectBlockId = await this.getProjectBlockId(projectId);

    const [income, expense, budgets] = await Promise.all([
      this.prisma.projectTransaction.aggregate({
        where: { projectId: projectBlockId, type: { in: ['income', 'adjustment'] } },
        _sum: { amount: true },
      }),
      this.prisma.projectTransaction.aggregate({
        where: { projectId: projectBlockId, type: 'expense' },
        _sum: { amount: true },
      }),
      this.prisma.projectBudget.aggregate({
        where: { projectId: projectBlockId },
        _sum: { estimatedAmount: true, approvedAmount: true, actualAmount: true },
      }),
    ]);

    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);
    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      estimatedBudget: Number(budgets._sum.estimatedAmount ?? 0),
      approvedBudget: Number(budgets._sum.approvedAmount ?? 0),
      actualSpent: Number(budgets._sum.actualAmount ?? 0),
    };
  }
}
