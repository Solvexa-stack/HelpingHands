import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { CreateExpenseDto, ExpenseQueryDto, MarkExpensePaidDto } from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

/**
 * W8 — successor to the legacy `/projects/:projectId/financial/expenses`
 * flow (ProjectExpense). Every route requires who was paid, how much, why,
 * for which project, from which fund. Legacy fallback administrator-only;
 * with the policy engine (default-on) `fund_expense.*` governs — see
 * policy-registry.ts.
 */
@ApiTags('Expenses')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
@Controller({ path: 'expenses', version: '1' })
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an expense (pending approval)' })
  create(@Body() dto: CreateExpenseDto, @CurrentActor() actor: ActorContext) {
    return this.expensesService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses, filterable by project/fund/status' })
  findAll(@Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(query);
  }

  @Get('stage-summary')
  @ApiOperation({ summary: 'Reserved budget and actual spending for a project, grouped by execution stage' })
  stageSummary(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.expensesService.stageSummary(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Expense detail' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.findById(id);
  }

  @Post(':id/invoice')
  @ApiOperation({ summary: 'Attach an already-uploaded invoice to this expense' })
  attachInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body('invoiceId', ParseIntPipe) invoiceId: number,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.expensesService.attachInvoice(actor, id, invoiceId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve — posts the ledger debit and decreases the fund balance' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.expensesService.approve(actor, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending expense (no ledger entry posted)' })
  reject(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.expensesService.reject(actor, id);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Record the payment date for an approved expense (approval and payment are separate steps)' })
  markPaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkExpensePaidDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.expensesService.markPaid(actor, id, dto);
  }
}
