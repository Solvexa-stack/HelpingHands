import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FundingAgreementStatus, Prisma } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportingObligationsService } from '../org-reporting/reporting-obligations.service';

export interface CreateAgreementDto {
  organizationId: number;
  title: string;
  terms?: Record<string, unknown>;
  reportingSchedule?: Record<string, unknown>;
  startsAt?: string;
  endsAt?: string;
}

/**
 * W6-E1-S2 — FundingAgreement: the fund ↔ organization channel municipal
 * money flows through. Board-managed lifecycle draft → active (signed) →
 * suspended | completed | terminated. Allocations may reference an agreement;
 * its terms can block further disbursements while reports are overdue.
 */
@Injectable()
export class AgreementsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private obligations: ReportingObligationsService,
  ) {}

  async createAgreement(actor: ActorContext, fundId: number, dto: CreateAgreementDto) {
    const [fund, organization] = await Promise.all([
      this.prisma.fund.findFirst({ where: { id: fundId, deletedAt: null } }),
      this.prisma.organization.findUnique({ where: { id: dto.organizationId } }),
    ]);
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    if (fund.status !== 'active') throw new BadRequestException(`Fund is ${fund.status} — no new agreements`);
    if (!organization) throw new NotFoundException(`Organization #${dto.organizationId} not found`);
    if (organization.status !== 'active') {
      throw new BadRequestException('Only verified, active organizations can enter funding agreements');
    }

    const agreement = await this.prisma.fundingAgreement.create({
      data: {
        fundId,
        organizationId: dto.organizationId,
        title: dto.title,
        terms: (dto.terms ?? {}) as Prisma.InputJsonValue,
        reportingSchedule: (dto.reportingSchedule ?? {}) as Prisma.InputJsonValue,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        createdByUserId: actor.userId,
      },
    });
    this.eventBus.publish({
      event: 'agreement.created',
      actor,
      subject: { type: 'funding_agreement', id: agreement.id },
      data: { fundId, organizationId: dto.organizationId, title: dto.title },
    });
    return agreement;
  }

  /** Signing activates the agreement — obligations start accruing. */
  async sign(actor: ActorContext, agreementId: number) {
    const agreement = await this.agreementOr404(agreementId);
    if (agreement.status !== 'draft') {
      throw new BadRequestException(`Only draft agreements can be signed (status: ${agreement.status})`);
    }
    const signed = await this.prisma.fundingAgreement.update({
      where: { id: agreementId },
      data: { status: 'active', signedAt: new Date(), startsAt: agreement.startsAt ?? new Date() },
    });
    this.eventBus.publish({
      event: 'agreement.signed',
      actor,
      subject: { type: 'funding_agreement', id: agreementId },
      data: { fundId: agreement.fundId, organizationId: agreement.organizationId },
    });
    return signed;
  }

  async setStatus(actor: ActorContext, agreementId: number, status: FundingAgreementStatus) {
    const agreement = await this.agreementOr404(agreementId);
    const allowed: Record<FundingAgreementStatus, FundingAgreementStatus[]> = {
      draft: ['terminated'],
      active: ['suspended', 'completed', 'terminated'],
      suspended: ['active', 'terminated'],
      completed: [],
      terminated: [],
    };
    if (!allowed[agreement.status].includes(status)) {
      throw new BadRequestException(`Cannot move an agreement from "${agreement.status}" to "${status}"`);
    }
    const updated = await this.prisma.fundingAgreement.update({
      where: { id: agreementId },
      data: { status },
    });
    this.eventBus.publish({
      event: 'agreement.updated',
      actor,
      subject: { type: 'funding_agreement', id: agreementId },
      data: { before: { status: agreement.status }, after: { status } },
    });
    return updated;
  }

  async listForFund(fundId: number) {
    return this.prisma.fundingAgreement.findMany({
      where: { fundId, deletedAt: null },
      orderBy: { id: 'desc' },
      include: {
        organization: { select: { id: true, name: true, type: true } },
        _count: { select: { allocations: true, reports: true } },
      },
    });
  }

  async listForOrg(organizationId: number) {
    return this.prisma.fundingAgreement.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { id: 'desc' },
      include: {
        fund: { select: { id: true, name: true } },
        _count: { select: { allocations: true, reports: true } },
      },
    });
  }

  async detail(agreementId: number) {
    const agreement = await this.prisma.fundingAgreement.findFirst({
      where: { id: agreementId, deletedAt: null },
      include: {
        fund: { select: { id: true, name: true, status: true } },
        organization: { select: { id: true, name: true, type: true } },
        allocations: { orderBy: { id: 'desc' } },
        reports: { orderBy: { id: 'desc' } },
      },
    });
    if (!agreement) throw new NotFoundException(`Agreement #${agreementId} not found`);
    const obligations = await this.obligations.obligationsFor(agreement as never);
    return { ...agreement, obligations, overdueCount: obligations.filter((o) => o.overdue).length };
  }

  private async agreementOr404(id: number) {
    const agreement = await this.prisma.fundingAgreement.findFirst({ where: { id, deletedAt: null } });
    if (!agreement) throw new NotFoundException(`Agreement #${id} not found`);
    return agreement;
  }
}
