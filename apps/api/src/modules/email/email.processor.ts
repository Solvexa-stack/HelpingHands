import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EmailService } from './email.service';

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  @Process('study_published')
  async handleStudyPublished(job: Job) {
    const { to, participantName, projectName, studyUrl, votingStartsAt } = job.data;
    await this.emailService.sendStudyPublishedEmail(to, participantName, projectName, studyUrl, votingStartsAt);
  }

  @Process('voting_open')
  async handleVotingOpen(job: Job) {
    const { to, participantName, projectName, voteUrl, votingEndsAt } = job.data;
    await this.emailService.sendVotingOpenEmail(to, participantName, projectName, voteUrl, votingEndsAt);
  }

  @Process('voting_reminder')
  async handleVotingReminder(job: Job) {
    const { to, participantName, projectName, voteUrl, hoursRemaining } = job.data;
    await this.emailService.sendVotingReminderEmail(to, participantName, projectName, voteUrl, hoursRemaining);
  }

  @Process('study_approved')
  async handleStudyApproved(job: Job) {
    const { to, participantName, projectName, donateUrl } = job.data;
    await this.emailService.sendStudyApprovedEmail(to, participantName, projectName, donateUrl);
  }

  @Process('study_rejected')
  async handleStudyRejected(job: Job) {
    const { to, adminName, projectName, reason } = job.data;
    await this.emailService.sendStudyRejectedEmail(to, adminName, projectName, reason);
  }

  @Process('donation_online_confirmed')
  async handleDonationOnlineConfirmed(job: Job) {
    const { to, participantName, amount, currency, projectName, transactionId, date } = job.data;
    await this.emailService.sendOnlineDonationConfirmedEmail(
      to,
      participantName,
      amount,
      currency,
      projectName,
      transactionId,
      date,
    );
  }

  @Process('donation_cash_approved')
  async handleDonationCashApproved(job: Job) {
    const { to, participantName, projectName, amount, donationId } = job.data;
    await this.emailService.sendDonationApprovedEmail(to, participantName, projectName, Number(amount), donationId);
  }
}
