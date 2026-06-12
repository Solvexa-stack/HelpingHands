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
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChangeVoteDto } from './dto/change-vote.dto';
import { VoteFiltersDto } from './dto/vote-filters.dto';

@Injectable()
export class VotingService {
  private readonly logger = new Logger(VotingService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Cast vote ────────────────────────────────────────────────────────────────

  async castVote(dto: CastVoteDto, userId: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: dto.studyId } });
    if (!study) throw new NotFoundException(`Study #${dto.studyId} not found`);

    if (study.status !== StudyStatus.voting_open) {
      throw new BadRequestException('This study is not currently accepting votes');
    }
    if (study.votingEndsAt && study.votingEndsAt < new Date()) {
      throw new BadRequestException('Voting period has ended');
    }

    const existing = await this.prisma.studyVote.findUnique({
      where: { studyId_userId: { studyId: dto.studyId, userId } },
    });
    if (existing) throw new ConflictException('You have already voted on this study');

    return this.prisma.studyVote.create({
      data: {
        studyId: dto.studyId,
        userId,
        choice: dto.choice,
        comment: dto.comment,
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  // ─── Change vote ──────────────────────────────────────────────────────────────

  async changeVote(studyId: number, userId: number, dto: ChangeVoteDto) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    if (study.status !== StudyStatus.voting_open) {
      throw new BadRequestException('Voting is no longer open for this study');
    }
    if (study.votingEndsAt && study.votingEndsAt < new Date()) {
      throw new BadRequestException('Voting period has ended');
    }

    const existing = await this.prisma.studyVote.findUnique({
      where: { studyId_userId: { studyId, userId } },
    });
    if (!existing) throw new NotFoundException('You have not voted on this study yet');

    return this.prisma.studyVote.update({
      where: { studyId_userId: { studyId, userId } },
      data: { choice: dto.choice, comment: dto.comment ?? null },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  // ─── Results (public) ─────────────────────────────────────────────────────────

  async getResults(studyId: number, userId?: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    const groups = await this.prisma.studyVote.groupBy({
      by: ['choice'],
      where: { studyId },
      _count: { choice: true },
    });

    const total = groups.reduce((sum, g) => sum + g._count.choice, 0);
    const countOf = (c: VoteChoice) =>
      groups.find((g) => g.choice === c)?._count.choice ?? 0;

    const pct = (n: number) =>
      total === 0 ? 0 : Math.round((n / total) * 1000) / 10;

    const forCount = countOf(VoteChoice.for);
    const againstCount = countOf(VoteChoice.against);
    const abstainCount = countOf(VoteChoice.abstain);

    let myVote: VoteChoice | null = null;
    if (userId) {
      const vote = await this.prisma.studyVote.findUnique({
        where: { studyId_userId: { studyId, userId } },
        select: { choice: true },
      });
      myVote = vote?.choice ?? null;
    }

    const recentComments = await this.prisma.studyVote.findMany({
      where: { studyId, comment: { not: null } },
      select: { choice: true, comment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

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

    const { choice, page = 1, limit = 50 } = filters;
    const { skip, take } = paginate(page, limit);

    const where: any = { studyId };
    if (choice) where.choice = choice;

    const [data, total] = await Promise.all([
      this.prisma.studyVote.findMany({
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
      this.prisma.studyVote.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  // ─── My votes (participant) ───────────────────────────────────────────────────

  async getMyVotes(userId: number) {
    const votes = await this.prisma.studyVote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        study: {
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
        },
      },
    });
    return votes;
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

    this.logger.log(`Auto-closed ${expired.length} expired voting(s): ids=${studyIds.join(',')}`);
    return { closed: expired.length };
  }
}
