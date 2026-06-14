import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole, ExpenseStatus } from '@prisma/client';
import { FinancialService } from './financial.service';
import {
  CreateBudgetDto, UpdateBudgetDto,
  CreateExpenseDto, UpdateExpenseDto, UpdateExpenseStatusDto,
  CreateTransactionDto,
} from './dto/financial.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Financial')
@ApiBearerAuth('JWT')
@Controller({ path: 'projects/:projectId/financial', version: '1' })
export class FinancialController {
  constructor(private financialService: FinancialService) {}

  // ─── Budgets ──────────────────────────────────────────────────────────────

  @Get('budgets')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'List budgets' })
  findBudgets(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.financialService.findBudgets(projectId);
  }

  @Post('budgets')
  @Roles(AdminRole.administrator, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Create a budget' })
  createBudget(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateBudgetDto,
  ) {
    return this.financialService.createBudget(projectId, dto);
  }

  @Patch('budgets/:id')
  @Roles(AdminRole.administrator, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Update a budget' })
  updateBudget(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.financialService.updateBudget(projectId, id, dto);
  }

  @Delete('budgets/:id')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Delete a budget' })
  removeBudget(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.financialService.removeBudget(projectId, id);
  }

  // ─── Expenses ─────────────────────────────────────────────────────────────

  @Get('expenses')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'List expenses' })
  findExpenses(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('budgetId') budgetId?: string,
    @Query('status') status?: ExpenseStatus,
  ) {
    return this.financialService.findExpenses(projectId, budgetId ? +budgetId : undefined, status);
  }

  @Post('expenses')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Create an expense' })
  createExpense(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.financialService.createExpense(projectId, dto);
  }

  @Patch('expenses/:id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Update an expense' })
  updateExpense(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.financialService.updateExpense(projectId, id, dto);
  }

  @Patch('expenses/:id/status')
  @Roles(AdminRole.administrator, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Approve or reject an expense' })
  updateExpenseStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.financialService.updateExpenseStatus(projectId, id, dto);
  }

  @Delete('expenses/:id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Delete an expense' })
  removeExpense(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.financialService.removeExpense(projectId, id);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  @Get('transactions')
  @Roles(AdminRole.administrator, AdminRole.financial_officer)
  @ApiOperation({ summary: 'List transaction ledger' })
  findTransactions(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.financialService.findTransactions(projectId);
  }

  @Post('transactions')
  @Roles(AdminRole.administrator, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Create manual transaction (adjustment/refund)' })
  createTransaction(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.financialService.createTransaction(projectId, dto);
  }

  @Get('summary')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Get financial summary for project' })
  getSummary(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.financialService.getSummary(projectId);
  }
}
