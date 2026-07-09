import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { StudyStatus, VoteChoice } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { ActorContext, systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChangeVoteDto } from './dto/change-vote.dto';
import { VoteFiltersDto } from './dto/vote-filters.dto';
import { TenancyRepository } from '../policy/tenancy.repository';
import { GovernanceService } from '../governance/governance.service';

@Injectable()
export class VotingService {
  private readonly logger = new Logger(VotingService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
    private governance: GovernanceService,
  ) {}

  /**
   * W3-E3-S2 — compatibility anchor: the study's current voting cycle is its
   * latest open round. Legacy voting_open studies that predate a round (edge:
   * unbackfilled data) get one self-healed to mirror the study window.
   */
  private async openRoundForStudy(study: {
    id: number;
    votingStartsAt: Date | null;
    votingEndsAt: Date | null;
  }) {
    const round = await this.prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: study.id, status: 'open' },
      orderBy: { id: 'desc' },
    });
    if (round) return round;
    this.logger.warn(`Self-healing missing vote round for study ${study.id}`);
    return this.prisma.voteRound.create({
      data: {
        subjectType: 'project_study',
        subjectId: study.id,
        opensAt: study.votingStartsAt ?? new Date(),
        closesAt: study.votingEndsAt,
        eligibility: { type: 'authenticated' },
        rules: {},
      },
    });
  }

  // ─── Cast vote ────────────────────────────────────────────────────────────────

  async castVote(actor: ActorContext, dto: CastVoteDto, userId: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: dto.studyId } });
    if (!study) throw new NotFoundException(`Study #${dto.studyId} not found`);

    if (study.status !== StudyStatus.voting_open) {
      throw new BadRequestException('This study is not currently accepting votes');
    }
    if (study.votingEndsAt && study.votingEndsAt < new Date()) {
      throw new BadRequestException('Voting period has ended');
    }

    const round = await this.openRoundForStudy(study);
    const existing = await this.prisma.vote.findUnique({
      where: { voteRoundId_userId: { voteRoundId: round.id, userId } },
    });
    if (existing) throw new ConflictException('You have already voted on this study');

    const vote = await this.prisma.vote.create({
      data: {
        voteRoundId: round.id,
        userId,
        choice: dto.choice,
        comment: dto.comment,
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    this.eventBus.publish({
      event: 'vote.cast',
      actor,
      subject: { type: 'vote', id: vote.id },
      data: { studyId: dto.studyId, voteRoundId: round.id, choice: dto.choice },
    });

    // contract compatibility: legacy vote rows carried studyId
    return { ...vote, studyId: dto.studyId };
  }

  // ─── Change vote ──────────────────────────────────────────────────────────────

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async changeVote(studyId: number, userId: number, dto: ChangeVoteDto) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    if (study.status !== StudyStatus.voting_open) {
      throw new BadRequestException('Voting is no longer open for this study');
    }
    if (study.votingEndsAt && study.votingEndsAt < new Date()) {
      throw new BadRequestException('Voting period has ended');
    }

    const round = await this.openRoundForStudy(study);
    const existing = await this.prisma.vote.findUnique({
      where: { voteRoundId_userId: { voteRoundId: round.id, userId } },
    });
    if (!existing) throw new NotFoundException('You have not voted on this study yet');

    // Compatibility exception to Vote immutability (endpoint contract, 14):
    // changing is allowed only while the round is open; retired in Wave 8.
    const updated = await this.prisma.vote.update({
      where: { voteRoundId_userId: { voteRoundId: round.id, userId } },
      data: { choice: dto.choice, comment: dto.comment ?? null },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
    return { ...updated, studyId };
  }

  // ─── Results (public) ─────────────────────────────────────────────────────────

  async getResults(studyId: number, userId?: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);
    await this.tenancy.assertProjectVisible(study.projectId); // W2 isolation (no-op for public/anon)

    const round = await this.governance.latestRoundForStudy(studyId);
    const groups = round
      ? await this.prisma.vote.groupBy({
          by: ['choice'],
          where: { voteRoundId: round.id },
          _count: { choice: true },
        })
      : [];

    const total = groups.reduce((sum, g) => sum + g._count.choice, 0);
    const countOf = (c: VoteChoice) =>
      groups.find((g) => g.choice === c)?._count.choice ?? 0;

    const pct = (n: number) =>
      total === 0 ? 0 : Math.round((n / total) * 1000) / 10;

    const forCount = countOf(VoteChoice.for);
    const againstCount = countOf(VoteChoice.against);
    const abstainCount = countOf(VoteChoice.abstain);

    let myVote: VoteChoice | null = null;
    if (userId && round) {
      const vote = await this.prisma.vote.findUnique({
        where: { voteRoundId_userId: { voteRoundId: round.id, userId } },
        select: { choice: true },
      });
      myVote = vote?.choice ?? null;
    }

    const recentComments = round
      ? await this.prisma.vote.findMany({
          where: { voteRoundId: round.id, comment: { not: null } },
          select: { choice: true, comment: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    return {
      studyId,
      status: study.status,
      votingEndsAt: study.votingEndsAt,
      total,
      for: { count: forCount, percentage: pct(forCount) },
      against: { count: againstCount, percentage: pct(againstCount) },
      abstain: { count: abstainCount, percentage: pct(abstainCount) },
      myVote,
      recentComments,
    };
  }

  // ─── Admin vote list (audit) ──────────────────────────────────────────────────

  async listVotes(studyId: number, filters: VoteFiltersDto) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);
    await this.tenancy.assertProjectVisible(study.projectId); // W2 isolation

    const { choice, page = 1, limit = 50 } = filters;
    const { skip, take } = paginate(page, limit);

    const rounds = await this.prisma.voteRound.findMany({
      where: { subjectType: 'project_study', subjectId: studyId },
      select: { id: true },
    });
    const where: any = { voteRoundId: { in: rounds.map((r) => r.id) } };
    if (choice) where.choice = choice;

    const [data, total] = await Promise.all([
      this.prisma.vote.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              admin: { select: { firstName: true, lastName: true, role: true } },
              participant: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.vote.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  // ─── My votes (participant) ───────────────────────────────────────────────────

  async getMyVotes(userId: number) {
    const votes = await this.prisma.vote.findMany({
      where: { userId, voteRound: { subjectType: 'project_study' } },
      orderBy: { createdAt: 'desc' },
      include: { voteRound: { select: { subjectId: true } } },
    });
    const studyIds = [...new Set(votes.map((v) => v.voteRound.subjectId))];
    const studies = await this.prisma.projectStudy.findMany({
      where: { id: { in: studyIds } },
      select: {
        id: true,
        status: true,
        project: {
          select: {
            id: true,
            block: {
              select: {
                translations: { select: { languageCode: true, name: true } },
              },
            },
          },
        },
      },
    });
    const byId = new Map(studies.map((s) => [s.id, s]));
    // legacy shape: each vote carries studyId + its study summary
    return votes.map(({ voteRound, ...vote }) => ({
      ...vote,
      studyId: voteRound.subjectId,
      study: byId.get(voteRound.subjectId) ?? null,
    }));
  }

  // ─── Cron: auto-close expired votings ────────────────────────────────────────

  async autoCloseExpiredVotings() {
    const expired = await this.prisma.projectStudy.findMany({
      where: {
        status: StudyStatus.voting_open,
        votingEndsAt: { lt: new Date() },
      },
      select: { id: true, projectId: true },
    });

    if (expired.length === 0) return { closed: 0 };

    const studyIds = expired.map((s) => s.id);
    const projectIds = expired.map((s) => s.projectId);

    await this.prisma.$transaction([
      this.prisma.projectStudy.updateMany({
        where: { id: { in: studyIds } },
        data: { status: StudyStatus.voting_closed },
      }),
      this.prisma.project.updateMany({
        where: { id: { in: projectIds } },
        data: { studyStatus: StudyStatus.voting_closed },
      }),
    ]);

    // Cron-triggered — no request context; one system actor per job run
    const actor = systemActor();

    // W3: close the rounds too — tally + result recorded on each
    for (const study of expired) {
      const open = await this.prisma.voteRound.findFirst({
        where: { subjectType: 'project_study', subjectId: study.id, status: 'open' },
      });
      if (open) await this.governance.closeRound(actor, open.id).catch(() => null);
    }
    for (const study of expired) {
      this.eventBus.publish({
        event: 'voting.closed',
        actor,
        subject: { type: 'study', id: study.id },
        data: { projectId: study.projectId, status: StudyStatus.voting_closed, auto: true },
      });
    }

    this.logger.log(`Auto-closed ${expired.length} expired voting(s): ids=${studyIds.join(',')}`);
    return { closed: expired.length };
  }
}
