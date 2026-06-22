"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailProcessor_1;
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bull_2 = require("bull");
const email_service_1 = require("./email.service");
let EmailProcessor = EmailProcessor_1 = class EmailProcessor {
    constructor(emailService) {
        this.emailService = emailService;
        this.logger = new common_1.Logger(EmailProcessor_1.name);
    }
    async handleStudyPublished(job) {
        const { to, participantName, projectName, studyUrl, votingStartsAt } = job.data;
        await this.emailService.sendStudyPublishedEmail(to, participantName, projectName, studyUrl, votingStartsAt);
    }
    async handleVotingOpen(job) {
        const { to, participantName, projectName, voteUrl, votingEndsAt } = job.data;
        await this.emailService.sendVotingOpenEmail(to, participantName, projectName, voteUrl, votingEndsAt);
    }
    async handleVotingReminder(job) {
        const { to, participantName, projectName, voteUrl, hoursRemaining } = job.data;
        await this.emailService.sendVotingReminderEmail(to, participantName, projectName, voteUrl, hoursRemaining);
    }
    async handleStudyApproved(job) {
        const { to, participantName, projectName, donateUrl } = job.data;
        await this.emailService.sendStudyApprovedEmail(to, participantName, projectName, donateUrl);
    }
    async handleStudyRejected(job) {
        const { to, adminName, projectName, reason } = job.data;
        await this.emailService.sendStudyRejectedEmail(to, adminName, projectName, reason);
    }
    async handleDonationOnlineConfirmed(job) {
        const { to, participantName, amount, currency, projectName, transactionId, date } = job.data;
        await this.emailService.sendOnlineDonationConfirmedEmail(to, participantName, amount, currency, projectName, transactionId, date);
    }
    async handleDonationCashApproved(job) {
        const { to, participantName, projectName, amount, donationId } = job.data;
        await this.emailService.sendDonationApprovedEmail(to, participantName, projectName, Number(amount), donationId);
    }
};
exports.EmailProcessor = EmailProcessor;
__decorate([
    (0, bull_1.Process)('study_published'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleStudyPublished", null);
__decorate([
    (0, bull_1.Process)('voting_open'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleVotingOpen", null);
__decorate([
    (0, bull_1.Process)('voting_reminder'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleVotingReminder", null);
__decorate([
    (0, bull_1.Process)('study_approved'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleStudyApproved", null);
__decorate([
    (0, bull_1.Process)('study_rejected'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleStudyRejected", null);
__decorate([
    (0, bull_1.Process)('donation_online_confirmed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleDonationOnlineConfirmed", null);
__decorate([
    (0, bull_1.Process)('donation_cash_approved'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof bull_2.Job !== "undefined" && bull_2.Job) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], EmailProcessor.prototype, "handleDonationCashApproved", null);
exports.EmailProcessor = EmailProcessor = EmailProcessor_1 = __decorate([
    (0, bull_1.Processor)('email'),
    __metadata("design:paramtypes", [email_service_1.EmailService])
], EmailProcessor);
//# sourceMappingURL=email.processor.js.map