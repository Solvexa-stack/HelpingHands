import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('mail.host'),
      port: config.get('mail.port'),
      secure: config.get('mail.secure'),
      auth: {
        user: config.get('mail.user'),
        pass: config.get('mail.pass'),
      },
    });
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('mail.from'),
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }

  async sendWelcomeEmail(to: string, name: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Welcome, ${name}!</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Thank you for joining HelpingHands. Your account has been created successfully.
            You can now browse projects and create donation requests.
          </p>
          <a href="${this.config.get('app.webUrl')}/dashboard"
             style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">
            Go to Dashboard
          </a>
        </div>
      </div>`;
    await this.send(to, 'Welcome to HelpingHands', html);
  }

  async sendDonationApprovedEmail(
    to: string,
    name: string,
    projectName: string,
    amount: number,
    donationId: number,
  ) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #16a34a; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Donation Approved ✅</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Dear <strong>${name}</strong>,<br/><br/>
            Your donation has been received and approved successfully.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#e5e7eb;">
              <td style="padding:10px;font-weight:bold;">Project</td>
              <td style="padding:10px;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding:10px;font-weight:bold;">Amount</td>
              <td style="padding:10px;color:#16a34a;font-weight:bold;">$${amount.toLocaleString()}</td>
            </tr>
            <tr style="background:#e5e7eb;">
              <td style="padding:10px;font-weight:bold;">Donation ID</td>
              <td style="padding:10px;">#${donationId}</td>
            </tr>
          </table>
          <p style="color:#4b5563;">
            Thank you for your generous contribution. Your support makes a real difference.
          </p>
          <a href="${this.config.get('app.webUrl')}/dashboard/donations"
             style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">
            View My Donations
          </a>
        </div>
      </div>`;
    await this.send(to, 'Donation Approved — HelpingHands', html);
  }

  async sendDonationRejectedEmail(to: string, name: string, projectName: string, notes?: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Donation Status Update</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Dear <strong>${name}</strong>,<br/><br/>
            Unfortunately, your donation for <strong>${projectName}</strong> could not be processed.
          </p>
          ${notes ? `<p style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;color:#7f1d1d;">Reason: ${notes}</p>` : ''}
          <p style="color:#4b5563;">Please contact us if you have any questions.</p>
        </div>
      </div>`;
    await this.send(to, 'Donation Status Update — HelpingHands', html);
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const resetUrl = `${this.config.get('app.webUrl')}/auth/reset-password?token=${token}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Reset Your Password</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            You requested a password reset. Click the button below to set a new password.
            This link expires in 1 hour.
          </p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">
            Reset Password
          </a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
            If you did not request this, please ignore this email.
          </p>
        </div>
      </div>`;
    await this.send(to, 'Reset Your Password — HelpingHands', html);
  }
}
