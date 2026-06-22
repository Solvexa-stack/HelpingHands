"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let EmailService = EmailService_1 = class EmailService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(EmailService_1.name);
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
    async send(to, subject, html) {
        try {
            await this.transporter.sendMail({
                from: this.config.get('mail.from'),
                to,
                subject,
                html,
            });
            this.logger.log(`Email sent to ${to}: ${subject}`);
        }
        catch (err) {
            this.logger.error(`Failed to send email to ${to}: ${err.message}`);
        }
    }
    async sendWelcomeEmail(to, name) {
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
    async sendDonationApprovedEmail(to, name, projectName, amount, donationId) {
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
    async sendDonationRejectedEmail(to, name, projectName, notes) {
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
    async sendContactEmail(name, from, subject, message) {
        const adminEmail = this.config.get('mail.from') || this.config.get('mail.user');
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">New Contact Message</h2>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#e5e7eb;"><td style="padding:10px;font-weight:bold;">From</td><td style="padding:10px;">${name} &lt;${from}&gt;</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Subject</td><td style="padding:10px;">${subject}</td></tr>
          </table>
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-top:8px;">
            <p style="color:#374151;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Reply directly to ${from}</p>
        </div>
      </div>`;
        await this.send(adminEmail, `Contact: ${subject}`, html);
        const ack = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">HelpingHands</h1>
        </div>
        <div style="padding: 32px; background: #f9fafb;">
          <h2 style="color: #1f2937;">We received your message!</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Hi <strong>${name}</strong>,<br/><br/>
            Thank you for reaching out. We'll get back to you within 24 hours.
          </p>
        </div>
      </div>`;
        await this.send(from, 'We received your message — HelpingHands', ack);
    }
    renderTemplate(templateName, vars) {
        const templatePath = path.join(__dirname, 'templates', templateName);
        let html = fs.readFileSync(templatePath, 'utf-8');
        for (const [key, value] of Object.entries(vars)) {
            html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
        }
        html = html.replace(/\{\{[^}]*\}\}/g, '');
        return html;
    }
    async sendStudyPublishedEmail(to, participantName, projectName, studyUrl, votingStartsAt) {
        const html = this.renderTemplate('study-published.html', {
            participantName,
            projectName,
            studyUrl,
            votingStartsAt: votingStartsAt ?? '',
        });
        await this.send(to, `Study Published: ${projectName} — HelpingHands`, html);
    }
    async sendVotingOpenEmail(to, participantName, projectName, voteUrl, votingEndsAt) {
        const html = this.renderTemplate('voting-open.html', {
            participantName,
            projectName,
            voteUrl,
            votingEndsAt,
        });
        await this.send(to, `Voting is now open: ${projectName} — HelpingHands`, html);
    }
    async sendVotingReminderEmail(to, participantName, projectName, voteUrl, hoursRemaining) {
        const html = this.renderTemplate('voting-reminder.html', {
            participantName,
            projectName,
            voteUrl,
            hoursRemaining,
        });
        await this.send(to, `Reminder: Vote for ${projectName} closes soon — HelpingHands`, html);
    }
    async sendStudyApprovedEmail(to, participantName, projectName, donateUrl) {
        const html = this.renderTemplate('study-approved.html', {
            participantName,
            projectName,
            donateUrl,
        });
        await this.send(to, `Study Approved: ${projectName} is now open for donations — HelpingHands`, html);
    }
    async sendOnlineDonationConfirmedEmail(to, participantName, amount, currency, projectName, transactionId, date) {
        const html = this.renderTemplate('donation-online-confirmed.html', {
            participantName,
            amount,
            currency,
            projectName,
            transactionId,
            date,
        });
        await this.send(to, `Donation Confirmed: ${projectName} — HelpingHands`, html);
    }
    async sendStudyRejectedEmail(to, adminName, projectName, reason) {
        const html = this.renderTemplate('study-rejected.html', {
            adminName,
            projectName,
            reason,
        });
        await this.send(to, `Study Rejected: ${projectName} — HelpingHands`, html);
    }
    async sendPasswordResetEmail(to, token) {
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
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], EmailService);
//# sourceMappingURL=email.service.js.map