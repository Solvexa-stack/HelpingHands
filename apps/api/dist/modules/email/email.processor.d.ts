import { Job } from 'bull';
import { EmailService } from './email.service';
export declare class EmailProcessor {
    private readonly emailService;
    private readonly logger;
    constructor(emailService: EmailService);
    handleStudyPublished(job: Job): Promise<void>;
    handleVotingOpen(job: Job): Promise<void>;
    handleVotingReminder(job: Job): Promise<void>;
    handleStudyApproved(job: Job): Promise<void>;
    handleStudyRejected(job: Job): Promise<void>;
    handleDonationOnlineConfirmed(job: Job): Promise<void>;
    handleDonationCashApproved(job: Job): Promise<void>;
}
