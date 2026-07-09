import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { TreasuryService } from './treasury.service';

/**
 * W5-E2 read surface + controller flags. Postings happen exclusively through
 * money events and the funds module — there is no raw posting endpoint.
 */
@ApiTags('Treasury')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'treasury', version: '1' })
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('accounts/:id/statement')
  @ApiOperation({ summary: 'Account statement with running balance' })
  statement(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.treasuryService.statement(
      id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'Legacy journal vs ledger balance, per project (E4 gate)' })
  reconciliation() {
    return this.treasuryService.reconciliation();
  }

  @Post('transactions/:id/flag')
  @ApiOperation({ summary: 'Controller flag on a ledger transaction (audited event)' })
  flag(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.treasuryService.flagTransaction(actor, id, reason ?? 'flagged');
  }
}
