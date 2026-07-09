import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { GovernanceService } from './governance.service';
import { CastRoundVoteDto, DecisionQueryDto, OpenRoundDto, RecordDecisionDto } from './dto/governance.dto';

/**
 * W3-E2 — Board governance. Legacy fallback is administrator-only
 * (POLICY_ENFORCED=false, 09 rollback rule); with policy enforcement on,
 * the per-route board-role grants in POLICY_REGISTRY govern.
 */
@ApiTags('Governance')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'governance', version: '1' })
export class GovernanceController {
  constructor(private governanceService: GovernanceService) {}

  @Post('decisions')
  @ApiOperation({ summary: 'Record an immutable Board decision (rationale mandatory)' })
  recordDecision(@Body() dto: RecordDecisionDto, @CurrentActor() actor: ActorContext) {
    return this.governanceService.recordDecision(actor, dto);
  }

  @Get('decisions')
  @ApiOperation({ summary: 'Decision history (Board views)' })
  listDecisions(@Query() query: DecisionQueryDto) {
    return this.governanceService.listDecisions(query);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Cross-org review queue (Board workspace)' })
  reviewQueue() {
    return this.governanceService.reviewQueue();
  }

  @Post('rounds')
  @ApiOperation({ summary: 'Open a vote round on a subject' })
  openRound(@Body() dto: OpenRoundDto, @CurrentActor() actor: ActorContext) {
    return this.governanceService.openRound(actor, dto);
  }

  @Get('rounds')
  @ApiOperation({ summary: 'List vote rounds' })
  listRounds(@Query('subjectType') subjectType?: string, @Query('subjectId') subjectId?: string) {
    return this.governanceService.listRounds(subjectType, subjectId ? Number(subjectId) : undefined);
  }

  @Get('rounds/:id')
  @ApiOperation({ summary: 'Round detail with votes and live tally' })
  getRound(@Param('id', ParseIntPipe) id: number) {
    return this.governanceService.getRound(id);
  }

  @Post('rounds/:id/votes')
  @ApiOperation({ summary: 'Cast an immutable vote in a round (eligibility-checked)' })
  castVote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CastRoundVoteDto,
    @CurrentActor() actor: ActorContext,
    @CurrentUser('sub') userId: number,
  ) {
    return this.governanceService.castVote(actor, id, dto, userId);
  }

  @Patch('rounds/:id/close')
  @ApiOperation({ summary: 'Close a round: tally + quorum/threshold evaluation recorded' })
  closeRound(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.governanceService.closeRound(actor, id);
  }
}
