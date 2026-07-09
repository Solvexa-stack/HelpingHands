import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VotingService } from './voting.service';
import { StudyStatus } from '@prisma/client';

@Injectable()
export class VotingScheduler {
  constructor(
    private readonly votingService: VotingService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredVotings() {
    await this.votingService.autoCloseExpiredVotings();
  }

  @Cron('0 * * * *')
  async sendVotingReminders() {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 3_600_000);
    const windowEnd = new Date(now.getTime() + 25 * 3_600_000);

    // W3-E2-S3: reminders are round-scoped — each voting cycle gets its own
    // reminder; the legacy study field is kept synced until Wave 8.
    const rounds = await this.prisma.voteRound.findMany({
      where: {
        subjectType: 'project_study',
        status: 'open',
        closesAt: { gte: windowStart, lte: windowEnd },
        reminderSentAt: null,
      },
    });

    for (const round of rounds) {
      const study = await this.prisma.projectStudy.findFirst({
        where: { id: round.subjectId, status: StudyStatus.voting_open },
      });
      if (!study) continue;

      await this.notificationsService
        .notify({ type: 'voting_reminder', studyId: study.id })
        .catch(() => null);

      const sentAt = new Date();
      await this.prisma.voteRound.update({
        where: { id: round.id },
        data: { reminderSentAt: sentAt },
      });
      await this.prisma.projectStudy.update({
        where: { id: study.id },
        data: { reminderSentAt: sentAt },
      });
    }
  }
}
