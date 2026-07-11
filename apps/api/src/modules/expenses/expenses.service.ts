import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { TreasuryService } from '../treasury/treasury.service';
import { CreateExpenseDto, ExpenseQueryDto, MarkExpensePaidDto } from './dto/expense.dto';

const EXPENSE_INCLUDE = {
  fund: { select: { id: true, name: true, type: true } },
  project: { select: { id: true, blockId: true, value: true } },
  recipient: { select: { id: true, name: true, type: true } },
  invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, fileUrl: true, fileName: true } },
  createdByUser: { select: { id: true, email: true } },
  approvedByUser: { select: { id: true, email: true } },
} as const;

/**
 * W8 — successor to ProjectExpense (see that model's comment: legacy,
 * Block-keyed, frozen). Every Expense answers who was paid, how much, why,
 * for which project, from which fund, and which invoice supports it.
 * Approval posts a ledger transaction that debits the fund's account
 * directly (MoneyEventsSubscriber.onFundExpenseApproved) — never bypass the
 * ledger by writing balances directly.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
    private treasury: TreasuryService,
    private policy: PolicyService,
  ) {}

  async create(actor: ActorContext, dto: CreateExpenseDto) {
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund) throw new NotFoundException(`Fund #${dto.fundId} not found`);
    if (fund.status !== 'active') {
      throw new BadRequestException(`Fund is ${fund.status} — no new expenses`);
    }

    await this.tenancy.assertProjectVisible(dto.projectId); // W2 isolation
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);

    const recipient = await this.prisma.recipient.findFirst({ where: { id: dto.recipientId, deletedAt: null } });
    if (!recipient) throw new NotFoundException(`Recipient #${dto.recipientId} not found`);

    if (dto.invoiceId != null) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, deletedAt: null } });
      if (!invoice) throw new NotFoundException(`Invoice #${dto.invoiceId} not found`);
    }

    const expense = await this.prisma.expense.create({
      data: {
        fundId: dto.fundId,
        projectId: dto.projectId,
        amount: dto.amount,
        category: dto.category,
        description: dto.description,
        recipientId: dto.recipientId,
        invoiceId: dto.invoiceId,
        notes: dto.notes,
        stage: dto.stage,
        createdByUserId: actor.userId!,
      },
      include: EXPENSE_INCLUDE,
    });

    this.eventBus.publish({
      event: 'fund_expense.submitted',
      actor,
      subject: { type: 'expense', id: expense.id },
      data: { fundId: dto.fundId, projectId: dto.projectId, amount: dto.amount, category: dto.category },
    });

    return expense;
  }

  /**
   * Funding Platform Audit §3: "Reports must show spending by phase."
   * Groups this project's reserved budget (FundAllocation) and actual
   * spending (approved Expense) by ExecutionStage — the tagging both models
   * carry (see schema comment). Untagged rows fall under `null`.
   */
  async stageSummary(projectId: number) {
    await this.tenancy.assertProjectVisible(projectId);
    const [allocations, expenses] = await Promise.all([
      this.prisma.fundAllocation.findMany({
        where: { projectId, status: { notIn: ['rejected', 'proposed'] } },
        select: { stage: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: { projectId, status: 'approved' },
        select: { stage: true, amount: true },
      }),
    ]);

    const key = (s: string | null) => s ?? 'untagged';
    const byStage = new Map<string, { allocated: number; spent: number }>();
    for (const a of allocations) {
      const k = key(a.stage);
      const row = byStage.get(k) ?? { allocated: 0, spent: 0 };
      row.allocated += Number(a.amount);
      byStage.set(k, row);
    }
    for (const e of expenses) {
      const k = key(e.stage);
      const row = byStage.get(k) ?? { allocated: 0, spent: 0 };
      row.spent += Number(e.amount);
      byStage.set(k, row);
    }

    return [...byStage.entries()].map(([stage, totals]) => ({ stage, ...totals }));
  }

  async findAll(query: ExpenseQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.fundId) where.fundId = query.fundId;
    if (query.status) where.status = query.status;

    // W2 isolation: same relation-scoping pattern as DonationsService.findAll
    const scopedWhere = await this.tenancy.enforcedProjectRelationWhere(
      query.projectId ? { ...where, projectId: query.projectId } : where,
      'expense.list',
    );

    return this.prisma.expense.findMany({
      where: scopedWhere,
      orderBy: { id: 'desc' },
      include: EXPENSE_INCLUDE,
    });
  }

  async findById(id: number) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
    if (!expense) throw new NotFoundException(`Expense #${id} not found`);
    await this.tenancy.assertProjectVisible(expense.projectId); // W2 isolation
    return expense;
  }

  async attachInvoice(actor: ActorContext, id: number, invoiceId: number) {
    const expense = await this.findById(id);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
    if (!invoice) throw new NotFoundException(`Invoice #${invoiceId} not found`);

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { invoiceId },
      include: EXPENSE_INCLUDE,
    });
    this.eventBus.publish({
      event: 'fund_expense.invoice-attached',
      actor,
      subject: { type: 'expense', id },
      data: { invoiceId, invoiceNumber: invoice.invoiceNumber },
    });
    return updated;
  }

  async approve(actor: ActorContext, id: number) {
    return this.decide(actor, id, ExpenseStatus.approved);
  }

  async reject(actor: ActorContext, id: number) {
    return this.decide(actor, id, ExpenseStatus.rejected);
  }

  /** Council/Board/super_admin — the oversight roles exempt from ordinary submitter-side restrictions. */
  private async isCouncilOrBoard(actor: ActorContext): Promise<boolean> {
    if (actor.userId == null) return false;
    return this.policy.holdsAnyGrant(
      actor.userId,
      [{ scope: 'platform', roles: ['board_chair', 'board_member', 'super_admin'] }],
      {},
    );
  }

  private async decide(actor: ActorContext, id: number, status: ExpenseStatus) {
    const expense = await this.findById(id);
    if (expense.status !== ExpenseStatus.pending) {
      throw new BadRequestException(`Expense is ${expense.status} — only pending expenses can be approved/rejected`);
    }

    // W9 — segregation of duties: an organization cannot approve its own
    // expense submission. Platform-scope actors (board_chair/board_member/
    // super_admin) are exempt — Council/Board oversight is the whole point of
    // the check, not another thing it should be blocked by.
    if (expense.createdByUserId === actor.userId && !(await this.isCouncilOrBoard(actor))) {
      throw new ForbiddenException('You cannot approve or reject your own expense submission');
    }

    if (status === ExpenseStatus.approved) {
      // Funding Platform Audit §4: expenses without supporting documents
      // should not be approvable unless explicitly allowed by policy — Board/
      // Council oversight can sign off without one (e.g. an emergency
      // disbursement), everyone else must attach an invoice first.
      if (expense.invoiceId == null && !(await this.isCouncilOrBoard(actor))) {
        throw new BadRequestException(
          'This expense has no attached invoice — attach one, or have Board/Council approve without it',
        );
      }

      // Never let the ledger go negative on the fund's own recorded balance —
      // validated on the backend regardless of what the UI already checked.
      const fundAccount = await this.treasury.fundAccount(expense.fundId);
      const available = await this.treasury.balance(fundAccount.id);
      if (Number(expense.amount) > available) {
        throw new BadRequestException(
          `Insufficient fund balance: ${available} available, expense is ${expense.amount}`,
        );
      }
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status,
        approvedByUserId: status === ExpenseStatus.approved ? actor.userId : undefined,
        approvedAt: status === ExpenseStatus.approved ? new Date() : undefined,
      },
      include: EXPENSE_INCLUDE,
    });

    // Awaited so Treasury posts the ledger debit before this request
    // returns — the fund's balance and this response are never out of sync.
    await this.eventBus.publishAndWait({
      event: status === ExpenseStatus.approved ? 'fund_expense.approved' : 'fund_expense.rejected',
      actor,
      subject: { type: 'expense', id },
      data: { fundId: expense.fundId, projectId: expense.projectId, amount: Number(expense.amount) },
    });

    return updated;
  }

  /**
   * Funding Platform Audit §2/§4: approval and payment are separate steps
   * (Expense Approval → Payment → Actual Spending). The ledger debit already
   * posts at approval time (money is reserved/spent from the fund's
   * perspective then); markPaid records the real-world disbursement date —
   * "approved" and "paid" can now be reported on independently.
   */
  async markPaid(actor: ActorContext, id: number, dto: MarkExpensePaidDto) {
    const expense = await this.findById(id);
    if (expense.status !== ExpenseStatus.approved) {
      throw new BadRequestException('Only approved expenses can be marked paid');
    }
    if (expense.paidAt != null) {
      throw new BadRequestException('This expense is already marked paid');
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const updated = await this.prisma.expense.update({
      where: { id },
      data: { paidAt },
      include: EXPENSE_INCLUDE,
    });

    this.eventBus.publish({
      event: 'fund_expense.paid',
      actor,
      subject: { type: 'expense', id },
      data: { fundId: expense.fundId, projectId: expense.projectId, amount: Number(expense.amount), paidAt },
    });

    return updated;
  }
}
