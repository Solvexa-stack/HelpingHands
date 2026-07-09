import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider, PaymentStatus, StudyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { PayPalService } from './paypal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActorContextService } from '../../events/actor-context.storage';
import { EventBusService } from '../../events/event-bus.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentFiltersDto } from './dto/payment-filters.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { TenancyRepository } from '../policy/tenancy.repository';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private paypalService: PayPalService,
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private eventBus: EventBusService,
    private actorContext: ActorContextService,
    private tenancy: TenancyRepository,
  ) {}

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async createCheckout(dto: CreateCheckoutDto, participantId: number) {
    const currency = (dto.currency ?? 'USD').toUpperCase();

    if ((dto.projectId == null) === (dto.fundId == null)) {
      throw new BadRequestException('Provide exactly one of projectId or fundId');
    }

    // W5-E5-S3: fund-directed donation — no project, credit goes to the fund
    let fundName: string | null = null;
    if (dto.fundId != null) {
      const fund = await this.prisma.fund.findFirst({ where: { id: dto.fundId, deletedAt: null } });
      if (!fund) throw new NotFoundException(`Fund #${dto.fundId} not found`);
      if (fund.status !== 'active') throw new ForbiddenException(`Fund is ${fund.status}`);
      fundName = fund.name;
    }

    const project = dto.projectId
      ? await this.prisma.project.findUnique({
          where: { id: dto.projectId },
          include: { block: { include: { translations: true } } },
        })
      : null;
    if (dto.projectId && !project) throw new NotFoundException(`Project #${dto.projectId} not found`);

    if (project && project.studyStatus !== StudyStatus.approved) {
      throw new ForbiddenException(
        'Online donations are only accepted for projects with an approved study',
      );
    }

    const successUrl =
      this.config.get<string>('payment.successUrl') ??
      'http://localhost:3200/en/donations/success';
    const cancelUrl =
      this.config.get<string>('payment.cancelUrl') ??
      'http://localhost:3200/en/donations/cancel';
    const projectName = project
      ? (project.block.translations[0]?.name ?? `Project #${project.id}`)
      : `Fund: ${fundName}`;

    if (dto.provider === PaymentProvider.stripe) {
      const amountCents = Math.round(dto.amount * 100);
      const session = await this.stripeService.createCheckoutSession({
        projectId: project?.id ?? 0,
        projectName,
        amount: amountCents,
        currency: currency.toLowerCase(),
        successUrl: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl,
        metadata: {
          projectId: String(project?.id ?? ''),
          fundId: String(dto.fundId ?? ''),
          participantId: String(participantId),
        },
      });

      const donation = await this.prisma.onlineDonation.create({
        data: {
          projectId: project?.id ?? null,
          fundId: dto.fundId ?? null,
          participantId,
          amount: dto.amount,
          currency,
          provider: PaymentProvider.stripe,
          providerSessionId: session.id,
          status: PaymentStatus.pending,
          metadata: { sessionId: session.id },
        },
      });

      return { checkoutUrl: session.url, donationId: donation.id };
    }

    // PayPal
    const amountCents = Math.round(dto.amount * 100);
    const order = await this.paypalService.createOrder({
      projectId: project?.id ?? 0,
      amount: amountCents,
      currency,
      description: `Donation to ${projectName}`,
    });

    const donation = await this.prisma.onlineDonation.create({
      data: {
        projectId: project?.id ?? null,
        fundId: dto.fundId ?? null,
        participantId,
        amount: dto.amount,
        currency,
        provider: PaymentProvider.paypal,
        providerSessionId: order.id,
        status: PaymentStatus.pending,
        metadata: { orderId: order.id },
      },
    });

    return { checkoutUrl: order.approvalUrl, donationId: donation.id };
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    let event: any;
    try {
      event = await this.stripeService.constructWebhookEvent(payload, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
      await this.logWebhook('stripe', 'unknown', payload, null, String(err));
      throw err;
    }

    await this.logWebhook('stripe', event.type, payload, null, null);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await this.completeDonationBySession(session.id, session.payment_intent ?? null);
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      await this.failDonationBySession(session.id);
    }

    await this.markWebhookProcessed('stripe', event.type, payload);
    return { received: true };
  }

  async handlePayPalWebhook(headers: Record<string, string>, body: string) {
    const valid = await this.paypalService.verifyWebhook(headers, body);
    if (!valid) {
      const err = 'PayPal webhook signature invalid';
      await this.logWebhook('paypal', 'unknown', Buffer.from(body), null, err);
      throw new ForbiddenException(err);
    }

    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      throw new ForbiddenException('Invalid PayPal webhook payload');
    }

    await this.logWebhook('paypal', event.event_type, Buffer.from(body), null, null);

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId: string = event.resource?.supplementary_data?.related_ids?.order_id ?? '';
      const captureId: string = event.resource?.id ?? '';
      if (orderId) await this.completeDonationBySession(orderId, captureId);
    } else if (event.event_type === 'PAYMENT.CAPTURE.DENIED') {
      const orderId: string = event.resource?.supplementary_data?.related_ids?.order_id ?? '';
      if (orderId) await this.failDonationBySession(orderId);
    }

    await this.markWebhookProcessed('paypal', event.event_type, Buffer.from(body));
    return { received: true };
  }

  async getDonationStatus(donationId: number, user: JwtPayload) {
    const donation = await this.prisma.onlineDonation.findUnique({
      where: { id: donationId },
      include: {
        project: { include: { block: { include: { translations: true } } } },
      },
    });
    if (!donation) throw new NotFoundException(`Online donation #${donationId} not found`);
    if (donation.projectId != null) await this.tenancy.assertProjectVisible(donation.projectId); // W2 isolation

    const isAdmin =
      user.referenceType === 'admin' &&
      (user.role === 'administrator' || user.role === 'employee' || user.role === 'financial_officer');

    if (!isAdmin && donation.participantId !== user.referenceId) {
      throw new ForbiddenException('You can only view your own donations');
    }

    return donation;
  }

  async listOnlineDonations(filters: PaymentFiltersDto, user: JwtPayload) {
    const { page = 1, limit = 15 } = filters;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.provider) where.provider = filters.provider;
    if (filters.projectId) where.projectId = filters.projectId;

    if (user.referenceType === 'participant') {
      where.participantId = user.referenceId;
    } else if (filters.participantId) {
      where.participantId = filters.participantId;
    }

    // W2 isolation: online donations are visible through their project's owner org
    const scopedWhere = await this.tenancy.enforcedProjectRelationWhere(where, 'online_donation.list');

    const [data, total] = await Promise.all([
      this.prisma.onlineDonation.findMany({
        where: scopedWhere,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { include: { block: { include: { translations: true } } } },
          participant: { include: { user: { select: { email: true, avatar: true } } } },
        },
      }),
      this.prisma.onlineDonation.count({ where: scopedWhere }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async updateProjectProgressionOnline(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    const [cashResult, onlineResult] = await Promise.all([
      this.prisma.projectDonation.aggregate({
        where: { projectId, status: 'approved' },
        _sum: { amount: true },
      }),
      this.prisma.onlineDonation.aggregate({
        where: { projectId, status: PaymentStatus.completed },
        _sum: { amount: true },
      }),
    ]);

    const collected =
      Number(cashResult._sum.amount ?? 0) + Number(onlineResult._sum.amount ?? 0);
    const value = Number(project.value);
    const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
    const isCompleted = collected >= value;

    await this.prisma.project.update({
      where: { id: projectId },
      data: { progression, isCompleted },
    });

    // Mirror of ProjectsService.recalculateProgress: an online payment can
    // also be the one that closes the project.
    if (isCompleted && !project.isCompleted) {
      this.eventBus.publish({
        event: 'project.closed',
        actor: this.actorContext.currentOrSystem(),
        subject: { type: 'project', id: projectId },
        data: { value, collected, progression },
      });
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async completeDonationBySession(sessionId: string, paymentId: string | null) {
    const donation = await this.prisma.onlineDonation.findUnique({
      where: { providerSessionId: sessionId },
    });
    if (!donation) return;
    if (donation.status === PaymentStatus.completed) return; // idempotent

    await this.prisma.onlineDonation.update({
      where: { id: donation.id },
      data: {
        status: PaymentStatus.completed,
        providerPaymentId: paymentId ?? undefined,
        paidAt: new Date(),
      },
    });

    // Webhook routes are public → the ALS actor is anonymous, but carries
    // the webhook request's requestId for correlation.
    await this.eventBus.publishAndWait({
      event: 'payment.completed',
      actor: this.actorContext.currentOrSystem(),
      subject: { type: 'online_donation', id: donation.id },
      data: { projectId: donation.projectId, fundId: (donation as { fundId?: number | null }).fundId ?? null, provider: donation.provider, amount: Number(donation.amount) },
    });

    if (donation.projectId != null) await this.updateProjectProgressionOnline(donation.projectId);

    this.notificationsService
      .notify({ type: 'donation_online_confirmed', donationId: donation.id })
      .catch(() => null);
  }

  private async failDonationBySession(sessionId: string) {
    const donation = await this.prisma.onlineDonation.findUnique({
      where: { providerSessionId: sessionId },
    });
    if (!donation) return;
    if (donation.status !== PaymentStatus.pending) return;

    await this.prisma.onlineDonation.update({
      where: { id: donation.id },
      data: { status: PaymentStatus.failed },
    });

    this.eventBus.publish({
      event: 'payment.failed',
      actor: this.actorContext.currentOrSystem(),
      subject: { type: 'online_donation', id: donation.id },
      data: { projectId: donation.projectId, provider: donation.provider, amount: Number(donation.amount) },
    });
  }

  private async logWebhook(
    provider: string,
    eventType: string,
    payload: Buffer,
    processedAt: Date | null,
    error: string | null,
  ) {
    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(payload.toString());
      } catch {
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
    } catch (err) {
      this.logger.error('Failed to write webhook log', err);
    }
  }

  private async markWebhookProcessed(
    provider: string,
    eventType: string,
    payload: Buffer,
  ) {
    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(payload.toString());
      } catch {
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
    } catch (err) {
      this.logger.error('Failed to mark webhook as processed', err);
    }
  }
}
