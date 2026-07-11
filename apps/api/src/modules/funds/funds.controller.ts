import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { CreateFundDonationDto, CreateFundDto, ProposeAllocationDto, UpdateFundDto } from './dto/fund.dto';
import { FundsService } from './funds.service';
import { FundHierarchyService } from '../fund-hierarchy/fund-hierarchy.service';

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
  constructor(
    private fundsService: FundsService,
    private fundHierarchy: FundHierarchyService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a fund (Board)' })
  create(@Body() dto: CreateFundDto, @CurrentActor() actor: ActorContext) {
    return this.fundsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List funds with balances' })
  list() {
    return this.fundsService.list();
  }

  // W9 — declared ahead of `:id` on purpose: a literal segment route must
  // register before a `:id` route in the same controller, or Express treats
  // "hierarchy" as an :id value (same pitfall as funds/agreements/:id).
  @Get('hierarchy')
  @ApiOperation({ summary: 'Fund hierarchy: master funds (mirroring the category taxonomy) → organization funds → projects' })
  hierarchy() {
    return this.fundHierarchy.tree();
  }

  // W9 — same literal-segment-before-:id reasoning as `hierarchy` above.
  // Read-only "what would fund a project in this sector" preview for the
  // project creation flow's fund picker.
  @Get('suggested')
  @ApiOperation({ summary: 'Suggested funds for a sector: master fund, the organization\'s fund, and any council/donor funds scoped to it' })
  suggested(@Query('categoryId', ParseIntPipe) categoryId: number, @Query('organizationId') organizationId?: string) {
    return this.fundHierarchy.suggestedFunds(categoryId, organizationId ? Number(organizationId) : undefined);
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
  @ApiOperation({ summary: 'Update fund (status/type/policy changes are Board-audited)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFundDto,
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
    @Body() dto: ProposeAllocationDto,
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

  // ─── Fund donations (Donor → FundDonation → Fund → FundAllocation → Project) ─

  @Post(':id/donations')
  @ApiOperation({ summary: 'Record a fund-directed donation (pending until confirmed)' })
  recordDonation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFundDonationDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.fundsService.recordDonation(actor, id, dto);
  }

  @Get(':id/donations')
  @ApiOperation({ summary: 'List donations recorded against this fund' })
  listDonations(@Param('id', ParseIntPipe) id: number) {
    return this.fundsService.listDonations(id);
  }

  @Post('donations/:donationId/approve')
  @ApiOperation({ summary: 'Confirm a donation — posts the ledger credit and increases the fund balance' })
  confirmDonation(@Param('donationId', ParseIntPipe) donationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.confirmDonation(actor, donationId);
  }

  @Post('donations/:donationId/reject')
  @ApiOperation({ summary: 'Reject a pending donation (no ledger entry posted)' })
  rejectDonation(@Param('donationId', ParseIntPipe) donationId: number, @CurrentActor() actor: ActorContext) {
    return this.fundsService.rejectDonation(actor, donationId);
  }
}
