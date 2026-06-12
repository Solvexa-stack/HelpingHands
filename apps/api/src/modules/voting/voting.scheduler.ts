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

    const studies = await this.prisma.projectStudy.findMany({
      where: {
        status: StudyStatus.voting_open,
        votingEndsAt: { gte: windowStart, lte: windowEnd },
        reminderSentAt: null,
      },
    });

    for (const study of studies) {
      await this.notificationsService
        .notify({ type: 'voting_reminder', studyId: study.id })
        .catch(() => null);

      await this.prisma.projectStudy.update({
        where: { id: study.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }
}
