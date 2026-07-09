import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationEvent } from './notification-event.type';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private config: ConfigService,
  ) {}

  @Process('handle_event')
  async handleEvent(job: Job<NotificationEvent>) {
    const event = job.data;
    try {
      await this.dispatch(event);
    } catch (err) {
      this.logger.error(`Failed to handle notification event ${event.type}`, err);
      throw err;
    }
  }

  private webUrl() {
    return this.config.get<string>('app.webUrl', 'http://localhost:3200');
  }

  private async dispatch(event: NotificationEvent) {
    switch (event.type) {
      case 'study_published':
        return this.handleStudyPublished(event.studyId, event.projectId);
      case 'voting_open':
        return this.handleVotingOpen(event.studyId, event.projectId);
      case 'voting_reminder':
        return this.handleVotingReminder(event.studyId);
      case 'study_approved':
        return this.handleStudyApproved(event.studyId, event.projectId);
      case 'study_rejected':
        return this.handleStudyRejected(event.studyId, event.adminId, event.reason);
      case 'study_changes_requested':
        return this.handleStudyChangesRequested(event.studyId);
      case 'donation_online_confirmed':
        return this.handleOnlineDonationConfirmed(event.donationId);
      case 'donation_cash_approved':
        return this.handleCashDonationApproved(event.donationId);
    }
  }

  // ─── study_published ─────────────────────────────────────────────────────────

  private async handleStudyPublished(studyId: number, projectId: number) {
    const [study, project] = await Promise.all([
      this.prisma.projectStudy.findUnique({ where: { id: studyId } }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        include: { block: { include: { translations: true } } },
      }),
    ]);
    if (!study || !project) return;

    const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
    const studyUrl = `${this.webUrl()}/en/projects/${projectId}/study`;

    const donors = await this.prisma.projectDonation.findMany({
      where: { projectId, status: 'approved' },
      select: {
        participant: { include: { user: { select: { id: true, email: true } } } },
      },
      distinct: ['participantId'],
    });

    const seen = new Set<number>();
    for (const d of donors) {
      const user = d.participant?.user;
      if (!user || seen.has(user.id)) continue;
      seen.add(user.id);

      await this.notificationsService.createNotificationRecord({
        userId: user.id,
        type: 'study_published',
        title: `Study published: ${projectName}`,
        body: `The feasibility study for ${projectName} has been published and is ready for review.`,
        referenceId: studyId,
        referenceType: 'study',
      });

      await this.notificationsService.dispatchEmailJob('study_published', {
        to: user.email,
        participantName: `${d.participant.firstName} ${d.participant.lastName}`,
        projectName,
        studyUrl,
        votingStartsAt: study.votingStartsAt?.toLocaleDateString() ?? '',
      });
    }
  }

  // ─── voting_open ─────────────────────────────────────────────────────────────

  private async handleVotingOpen(studyId: number, projectId: number) {
    const [study, project] = await Promise.all([
      this.prisma.projectStudy.findUnique({ where: { id: studyId } }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        include: { block: { include: { translations: true } } },
      }),
    ]);
    if (!study || !project) return;

    const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
    const voteUrl = `${this.webUrl()}/en/projects/${projectId}/vote`;
    const votingEndsAt = study.votingEndsAt?.toLocaleDateString() ?? 'TBD';

    const participants = await this.prisma.participant.findMany({
      include: { user: { select: { id: true, email: true } } },
    });

    for (const p of participants) {
      if (!p.user) continue;

      await this.notificationsService.createNotificationRecord({
        userId: p.user.id,
        type: 'voting_open',
        title: `Voting is now open: ${projectName}`,
        body: `Cast your vote for ${projectName} before ${votingEndsAt}.`,
        referenceId: studyId,
        referenceType: 'study',
      });

      await this.notificationsService.dispatchEmailJob('voting_open', {
        to: p.user.email,
        participantName: `${p.firstName} ${p.lastName}`,
        projectName,
        voteUrl,
        votingEndsAt,
      });
    }
  }

  // ─── voting_reminder ─────────────────────────────────────────────────────────

  private async handleVotingReminder(studyId: number) {
    const study = await this.prisma.projectStudy.findUnique({
      where: { id: studyId },
      include: {
        project: { include: { block: { include: { translations: true } } } },
      },
    });
    if (!study) return;

    const projectName = study.project.block.translations[0]?.name ?? `Project #${study.projectId}`;
    const voteUrl = `${this.webUrl()}/en/projects/${study.projectId}/vote`;
    const hoursRemaining = study.votingEndsAt
      ? Math.max(0, Math.round((study.votingEndsAt.getTime() - Date.now()) / 3_600_000)).toString()
      : '24';

    const votedUserIds = await this.prisma.studyVote.findMany({
      where: { studyId },
      select: { userId: true },
    });
    const votedSet = new Set(votedUserIds.map((v) => v.userId));

    const participants = await this.prisma.participant.findMany({
      include: { user: { select: { id: true, email: true } } },
    });

    for (const p of participants) {
      if (!p.user || votedSet.has(p.user.id)) continue;

      await this.notificationsService.createNotificationRecord({
        userId: p.user.id,
        type: 'voting_reminder',
        title: `Reminder: Vote for ${projectName} closes soon`,
        body: `Only ${hoursRemaining} hours left to vote on ${projectName}.`,
        referenceId: studyId,
        referenceType: 'study',
      });

      await this.notificationsService.dispatchEmailJob('voting_reminder', {
        to: p.user.email,
        participantName: `${p.firstName} ${p.lastName}`,
        projectName,
        voteUrl,
        hoursRemaining,
      });
    }
  }

  // ─── study_approved ──────────────────────────────────────────────────────────

  private async handleStudyApproved(studyId: number, projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { block: { include: { translations: true } } },
    });
    if (!project) return;

    const projectName = project.block.translations[0]?.name ?? `Project #${projectId}`;
    const donateUrl = `${this.webUrl()}/en/projects/${projectId}`;

    const [voters, donors] = await Promise.all([
      this.prisma.studyVote.findMany({
        where: { studyId },
        include: {
          user: {
            select: { id: true, email: true, participantId: true },
            include: { participant: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.projectDonation.findMany({
        where: { projectId, status: 'approved' },
        select: {
          participant: { include: { user: { select: { id: true, email: true } } } },
        },
        distinct: ['participantId'],
      }),
    ]);

    const seen = new Set<number>();

    const notify = async (userId: number, email: string, name: string) => {
      if (seen.has(userId)) return;
      seen.add(userId);

      await this.notificationsService.createNotificationRecord({
        userId,
        type: 'study_approved',
        title: `${projectName} has been approved!`,
        body: `Great news! ${projectName} passed the vote and is now open for donations.`,
        referenceId: projectId,
        referenceType: 'project',
      });

      await this.notificationsService.dispatchEmailJob('study_approved', {
        to: email,
        participantName: name,
        projectName,
        donateUrl,
      });
    };

    for (const v of voters) {
      if (!v.user?.email) continue;
      const name =
        (v.user as any).participant
          ? `${(v.user as any).participant.firstName} ${(v.user as any).participant.lastName}`
          : 'Participant';
      await notify(v.user.id, v.user.email, name);
    }

    for (const d of donors) {
      const user = d.participant?.user;
      if (!user?.email) continue;
      const name = `${d.participant.firstName} ${d.participant.lastName}`;
      await notify(user.id, user.email, name);
    }
  }

  // ─── study_rejected ──────────────────────────────────────────────────────────

  private async handleStudyRejected(studyId: number, adminId: number, reason: string) {
    const [study, admin] = await Promise.all([
      this.prisma.projectStudy.findUnique({
        where: { id: studyId },
        include: { project: { include: { block: { include: { translations: true } } } } },
      }),
      this.prisma.admin.findUnique({
        where: { id: adminId },
        include: { user: { select: { id: true, email: true } } },
      }),
    ]);
    if (!study || !admin?.user) return;

    const projectName = study.project.block.translations[0]?.name ?? `Project #${study.projectId}`;
    const adminName = `${admin.firstName} ${admin.lastName}`;

    await this.notificationsService.createNotificationRecord({
      userId: admin.user.id,
      type: 'study_rejected',
      title: `Study rejected: ${projectName}`,
      body: `The study for ${projectName} was rejected. Reason: ${reason}`,
      referenceId: studyId,
      referenceType: 'study',
    });

    await this.notificationsService.dispatchEmailJob('study_rejected', {
      to: admin.user.email,
      adminName,
      projectName,
      reason,
    });
  }

  // ─── study_changes_requested (W3-E4-S3) ──────────────────────────────────────

  private async handleStudyChangesRequested(studyId: number) {
    const study = await this.prisma.projectStudy.findUnique({
      where: { id: studyId },
      include: {
        project: { include: { block: { include: { translations: true } } } },
        createdBy: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!study?.createdBy?.user) return;

    // Latest changes_requested decision carries the Board's rationale
    const decision = await this.prisma.boardDecision.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId, decision: 'changes_requested' },
      orderBy: { decidedAt: 'desc' },
    });
    const projectName = study.project.block.translations[0]?.name ?? `Project #${study.projectId}`;

    await this.notificationsService.createNotificationRecord({
      userId: study.createdBy.user.id,
      type: 'study_changes_requested',
      title: `Changes requested: ${projectName}`,
      body: `The Board requested changes to the study for ${projectName}.${decision ? ` Rationale: ${decision.rationale}` : ''}`,
      referenceId: studyId,
      referenceType: 'study',
    });
  }

  // ─── donation_online_confirmed ───────────────────────────────────────────────

  private async handleOnlineDonationConfirmed(donationId: number) {
    const donation = await this.prisma.onlineDonation.findUnique({
      where: { id: donationId },
      include: {
        project: { include: { block: { include: { translations: true } } } },
        participant: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!donation?.participant?.user) return;

    const projectName = donation.project.block.translations[0]?.name ?? `Project #${donation.projectId}`;
    const user = donation.participant.user;
    const name = `${donation.participant.firstName} ${donation.participant.lastName}`;

    await this.notificationsService.createNotificationRecord({
      userId: user.id,
      type: 'donation_online_confirmed',
      title: `Donation confirmed for ${projectName}`,
      body: `Your online donation of ${donation.amount} ${donation.currency} to ${projectName} was confirmed.`,
      referenceId: donationId,
      referenceType: 'online_donation',
    });

    await this.notificationsService.dispatchEmailJob('donation_online_confirmed', {
      to: user.email,
      participantName: name,
      amount: String(donation.amount),
      currency: donation.currency,
      projectName,
      transactionId: donation.providerPaymentId ?? donation.providerSessionId,
      date: (donation.paidAt ?? donation.createdAt).toLocaleDateString(),
    });
  }

  // ─── donation_cash_approved ──────────────────────────────────────────────────

  private async handleCashDonationApproved(donationId: number) {
    const donation = await this.prisma.projectDonation.findUnique({
      where: { id: donationId },
      include: {
        project: { include: { block: { include: { translations: true } } } },
        participant: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!donation?.participant?.user) return;

    const projectName = donation.project.block.translations[0]?.name ?? `Project #${donation.projectId}`;
    const user = donation.participant.user;
    const name = `${donation.participant.firstName} ${donation.participant.lastName}`;

    await this.notificationsService.createNotificationRecord({
      userId: user.id,
      type: 'donation_cash_approved',
      title: `Cash donation approved for ${projectName}`,
      body: `Your donation of $${Number(donation.amount).toLocaleString()} to ${projectName} has been approved.`,
      referenceId: donationId,
      referenceType: 'donation',
    });

    await this.notificationsService.dispatchEmailJob('donation_cash_approved', {
      to: user.email,
      participantName: name,
      projectName,
      amount: Number(donation.amount),
      donationId,
    });
  }
}
