import { ConfigService } from '@nestjs/config';
export declare class EmailService {
    private config;
    private readonly logger;
    private transporter;
    constructor(config: ConfigService);
    private send;
    sendWelcomeEmail(to: string, name: string): Promise<void>;
    sendDonationApprovedEmail(to: string, name: string, projectName: string, amount: number, donationId: number): Promise<void>;
    sendDonationRejectedEmail(to: string, name: string, projectName: string, notes?: string): Promise<void>;
    sendContactEmail(name: string, from: string, subject: string, message: string): Promise<void>;
    private renderTemplate;
    sendStudyPublishedEmail(to: string, participantName: string, projectName: string, studyUrl: string, votingStartsAt?: string): Promise<void>;
    sendVotingOpenEmail(to: string, participantName: string, projectName: string, voteUrl: string, votingEndsAt: string): Promise<void>;
    sendVotingReminderEmail(to: string, participantName: string, projectName: string, voteUrl: string, hoursRemaining: string): Promise<void>;
    sendStudyApprovedEmail(to: string, participantName: string, projectName: string, donateUrl: string): Promise<void>;
    sendOnlineDonationConfirmedEmail(to: string, participantName: string, amount: string, currency: string, projectName: string, transactionId: string, date: string): Promise<void>;
    sendStudyRejectedEmail(to: string, adminName: string, projectName: string, reason: string): Promise<void>;
    sendPasswordResetEmail(to: string, token: string): Promise<void>;
}
