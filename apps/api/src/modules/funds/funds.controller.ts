import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, FundStatus } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { FundsService } from './funds.service';

/**
 * W5-E3/E6 — funds & allocations. Legacy fallback administrator-only;
 * with policy enforcement, the registry's fund-scope grants govern
 * (director/deputy propose+disburse, accountant reconciles, controller
 * reads+flags only, Board manages).
 */
@ApiTags('Funds')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'funds', version: '1' })
export class FundsController {
  constructor(private fundsService: FundsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a fund (Board)' })
  create(@Body() dto: { name: string; purpose?: string; managingOrganizationId?: number; policy?: Record<string, unknown> }, @CurrentActor() actor: ActorContext) {
    return this.fundsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List funds with balances' })
  list() {
    return this.fundsService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fund detail: officers, allocations, balance' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.fundsService.detail(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Fund dashboard: balance, intake, allocations, spend by project' })
  dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.fundsService.dashboard(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update fund (status/policy changes are Board-audited)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; purpose?: string; status?: FundStatus; policy?: Record<string, unknown> },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.update(actor, id, dto);
  }

  @Post(':id/officers')
  @ApiOperation({ summary: 'Grant a fund officer role (Board)' })
  addOfficer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { userId: number; role: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.addOfficer(actor, id, dto.userId, dto.role);
  }

  @Delete(':id/officers/:userId/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a fund officer role (Board)' })
  removeOfficer(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('role') role: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.removeOfficer(actor, id, userId, role);
  }

  @Post(':id/allocations')
  @ApiOperation({ summary: 'Propose a fund→project allocation (starts the workflow)' })
  propose(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { projectId: number; amount: number; note?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.proposeAllocation(actor, id, dto);
  }

  @Post('allocations/:allocationId/approve')
  @ApiOperation({ summary: 'Approve (requires the BoardDecision the workflow guard demands)' })
  approve(@Param('allocationId', ParseIntPipe) allocationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.approveAllocation(actor, allocationId);
  }

  @Post('allocations/:allocationId/reject')
  @ApiOperation({ summary: 'Reject (requires the rejected BoardDecision)' })
  reject(@Param('allocationId', ParseIntPipe) allocationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.rejectAllocation(actor, allocationId);
  }

  @Post('allocations/:allocationId/disburse')
  @ApiOperation({ summary: 'Disburse a tranche: fund account → project account' })
  disburse(
    @Param('allocationId', ParseIntPipe) allocationId: number,
    @Body('amount') amount: number,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.disburse(actor, allocationId, Number(amount));
  }

  @Post('allocations/:allocationId/reconcile')
  @ApiOperation({ summary: 'Reconcile: disbursed equals allocated' })
  reconcile(@Param('allocationId', ParseIntPipe) allocationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.reconcileAllocation(actor, allocationId);
  }

  @Post('allocations/:allocationId/close')
  @ApiOperation({ summary: 'Close a reconciled allocation' })
  close(@Param('allocationId', ParseIntPipe) allocationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.closeAllocation(actor, allocationId);
  }
}
