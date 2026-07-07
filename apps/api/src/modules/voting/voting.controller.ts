import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { VotingService } from './voting.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChangeVoteDto } from './dto/change-vote.dto';
import { VoteFiltersDto } from './dto/vote-filters.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';

@ApiTags('Voting')
@Controller({ path: 'voting', version: '1' })
export class VotingController {
  constructor(private votingService: VotingService) {}

  @Post('cast')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Cast a vote on a study (any authenticated user)' })
  castVote(
    @Body() dto: CastVoteDto,
    @CurrentUser('sub') userId: number,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.votingService.castVote(actor, dto, userId);
  }

  @Patch(':studyId/change')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update your vote while voting is open' })
  changeVote(
    @Param('studyId', ParseIntPipe) studyId: number,
    @Body() dto: ChangeVoteDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.votingService.changeVote(studyId, userId, dto);
  }

  @Get(':studyId/results')
  @Public()
  @ApiOperation({ summary: 'Get vote results for a study (public, anonymized)' })
  getResults(
    @Param('studyId', ParseIntPipe) studyId: number,
    @CurrentUser() user: JwtPayload | undefined,
  ) {
    return this.votingService.getResults(studyId, user?.sub);
  }

  @Get('my-votes')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all votes cast by the current user' })
  getMyVotes(@CurrentUser('sub') userId: number) {
    return this.votingService.getMyVotes(userId);
  }

  @Get(':studyId/votes')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all votes for a study with user details (admin audit)' })
  listVotes(
    @Param('studyId', ParseIntPipe) studyId: number,
    @Query() filters: VoteFiltersDto,
  ) {
    return this.votingService.listVotes(studyId, filters);
  }
}
