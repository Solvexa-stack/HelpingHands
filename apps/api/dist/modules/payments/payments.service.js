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
var PaymentsService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const stripe_service_1 = require("./stripe.service");
const paypal_service_1 = require("./paypal.service");
const notifications_service_1 = require("../notifications/notifications.service");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, stripeService, paypalService, config, notificationsService) {
        this.prisma = prisma;
        this.stripeService = stripeService;
        this.paypalService = paypalService;
        this.config = config;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(PaymentsService_1.name);
    }
    async createCheckout(dto, participantId) {
        const currency = (dto.currency ?? 'USD').toUpperCase();
        const project = await this.prisma.project.findUnique({
            where: { id: dto.projectId },
            include: { block: { include: { translations: true } } },
        });
        if (!project)
            throw new common_1.NotFoundException(`Project #${dto.projectId} not found`);
        if (project.studyStatus !== client_1.StudyStatus.approved) {
            throw new common_1.ForbiddenException('Online donations are only accepted for projects with an approved study');
        }
        const successUrl = this.config.get('payment.successUrl') ??
            'http://localhost:3000/en/donations/success';
        const cancelUrl = this.config.get('payment.cancelUrl') ??
            'http://localhost:3000/en/donations/cancel';
        const projectName = project.block.translations[0]?.name ?? `Project #${project.id}`;
        if (dto.provider === client_1.PaymentProvider.stripe) {
            const amountCents = Math.round(dto.amount * 100);
            const session = await this.stripeService.createCheckoutSession({
                projectId: project.id,
                projectName,
                amount: amountCents,
                currency: currency.toLowerCase(),
                successUrl: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl,
                metadata: {
                    projectId: String(project.id),
                    participantId: String(participantId),
                },
            });
            const donation = await this.prisma.onlineDonation.create({
                data: {
                    projectId: project.id,
                    participantId,
                    amount: dto.amount,
                    currency,
                    provider: client_1.PaymentProvider.stripe,
                    providerSessionId: session.id,
                    status: client_1.PaymentStatus.pending,
                    metadata: { sessionId: session.id },
                },
            });
            return { checkoutUrl: session.url, donationId: donation.id };
        }
        const amountCents = Math.round(dto.amount * 100);
        const order = await this.paypalService.createOrder({
            projectId: project.id,
            amount: amountCents,
            currency,
            description: `Donation to ${projectName}`,
        });
        const donation = await this.prisma.onlineDonation.create({
            data: {
                projectId: project.id,
                participantId,
                amount: dto.amount,
                currency,
                provider: client_1.PaymentProvider.paypal,
                providerSessionId: order.id,
                status: client_1.PaymentStatus.pending,
                metadata: { orderId: order.id },
            },
        });
        return { checkoutUrl: order.approvalUrl, donationId: donation.id };
    }
    async handleStripeWebhook(payload, signature) {
        let event;
        try {
            event = await this.stripeService.constructWebhookEvent(payload, signature);
        }
        catch (err) {
            this.logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
            await this.logWebhook('stripe', 'unknown', payload, null, String(err));
            throw err;
        }
        await this.logWebhook('stripe', event.type, payload, null, null);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            await this.completeDonationBySession(session.id, session.payment_intent ?? null);
        }
        else if (event.type === 'checkout.session.expired') {
            const session = event.data.object;
            await this.failDonationBySession(session.id);
        }
        await this.markWebhookProcessed('stripe', event.type, payload);
        return { received: true };
    }
    async handlePayPalWebhook(headers, body) {
        const valid = await this.paypalService.verifyWebhook(headers, body);
        if (!valid) {
            const err = 'PayPal webhook signature invalid';
            await this.logWebhook('paypal', 'unknown', Buffer.from(body), null, err);
            throw new common_1.ForbiddenException(err);
        }
        let event;
        try {
            event = JSON.parse(body);
        }
        catch {
            throw new common_1.ForbiddenException('Invalid PayPal webhook payload');
        }
        await this.logWebhook('paypal', event.event_type, Buffer.from(body), null, null);
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const orderId = event.resource?.supplementary_data?.related_ids?.order_id ?? '';
            const captureId = event.resource?.id ?? '';
            if (orderId)
                await this.completeDonationBySession(orderId, captureId);
        }
        else if (event.event_type === 'PAYMENT.CAPTURE.DENIED') {
            const orderId = event.resource?.supplementary_data?.related_ids?.order_id ?? '';
            if (orderId)
                await this.failDonationBySession(orderId);
        }
        await this.markWebhookProcessed('paypal', event.event_type, Buffer.from(body));
        return { received: true };
    }
    async getDonationStatus(donationId, user) {
        const donation = await this.prisma.onlineDonation.findUnique({
            where: { id: donationId },
            include: {
                project: { include: { block: { include: { translations: true } } } },
            },
        });
        if (!donation)
            throw new common_1.NotFoundException(`Online donation #${donationId} not found`);
        const isAdmin = user.referenceType === 'admin' &&
            (user.role === 'administrator' || user.role === 'employee' || user.role === 'financial_officer');
        if (!isAdmin && donation.participantId !== user.referenceId) {
            throw new common_1.ForbiddenException('You can only view your own donations');
        }
        return donation;
    }
    async listOnlineDonations(filters, user) {
        const { page = 1, limit = 15 } = filters;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (filters.status)
            where.status = filters.status;
        if (filters.provider)
            where.provider = filters.provider;
        if (filters.projectId)
            where.projectId = filters.projectId;
        if (user.referenceType === 'participant') {
            where.participantId = user.referenceId;
        }
        else if (filters.participantId) {
            where.participantId = filters.participantId;
        }
        const [data, total] = await Promise.all([
            this.prisma.onlineDonation.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    project: { include: { block: { include: { translations: true } } } },
                    participant: { include: { user: { select: { email: true, avatar: true } } } },
                },
            }),
            this.prisma.onlineDonation.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async updateProjectProgressionOnline(projectId) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            return;
        const [cashResult, onlineResult] = await Promise.all([
            this.prisma.projectDonation.aggregate({
                where: { projectId, status: 'approved' },
                _sum: { amount: true },
            }),
            this.prisma.onlineDonation.aggregate({
                where: { projectId, status: client_1.PaymentStatus.completed },
                _sum: { amount: true },
            }),
        ]);
        const collected = Number(cashResult._sum.amount ?? 0) + Number(onlineResult._sum.amount ?? 0);
        const value = Number(project.value);
        const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
        const isCompleted = collected >= value;
        await this.prisma.project.update({
            where: { id: projectId },
            data: { progression, isCompleted },
        });
    }
    async completeDonationBySession(sessionId, paymentId) {
        const donation = await this.prisma.onlineDonation.findUnique({
            where: { providerSessionId: sessionId },
        });
        if (!donation)
            return;
        if (donation.status === client_1.PaymentStatus.completed)
            return;
        await this.prisma.onlineDonation.update({
            where: { id: donation.id },
            data: {
                status: client_1.PaymentStatus.completed,
                providerPaymentId: paymentId ?? undefined,
                paidAt: new Date(),
            },
        });
        await this.updateProjectProgressionOnline(donation.projectId);
        this.notificationsService
            .notify({ type: 'donation_online_confirmed', donationId: donation.id })
            .catch(() => null);
    }
    async failDonationBySession(sessionId) {
        const donation = await this.prisma.onlineDonation.findUnique({
            where: { providerSessionId: sessionId },
        });
        if (!donation)
            return;
        if (donation.status !== client_1.PaymentStatus.pending)
            return;
        await this.prisma.onlineDonation.update({
            where: { id: donation.id },
            data: { status: client_1.PaymentStatus.failed },
        });
    }
    async logWebhook(provider, eventType, payload, processedAt, error) {
        try {
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(payload.toString());
            }
            catch {
                parsedPayload = { raw: payload.toString() };
            }
            await this.prisma.webhookLog.create({
                data: {
                    provider,
                    eventType,
                    payload: parsedPayload,
                    processedAt,
                    error,
                },
            });
        }
        catch (err) {
            this.logger.error('Failed to write webhook log', err);
        }
    }
    async markWebhookProcessed(provider, eventType, payload) {
        try {
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(payload.toString());
            }
            catch {
                parsedPayload = { raw: payload.toString() };
            }
            await this.prisma.webhookLog.updateMany({
                where: {
                    provider,
                    eventType,
                    payload: parsedPayload,
                    processedAt: null,
                    error: null,
                },
                data: { processedAt: new Date() },
            });
        }
        catch (err) {
            this.logger.error('Failed to mark webhook as processed', err);
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        stripe_service_1.StripeService,
        paypal_service_1.PayPalService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, notifications_service_1.NotificationsService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map