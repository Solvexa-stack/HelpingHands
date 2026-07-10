import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrgReportStatus, OrgReportType, Prisma } from '@prisma/client';
import { ActorContext, systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportingObligationsService } from './reporting-obligations.service';

export interface SubmitReportDto {
  type: OrgReportType;
  title: string;
  projectId?: number;
  fundingAgreementId?: number;
  periodStart?: string;
  periodEnd?: string;
  payload?: Record<string, unknown>;
}

/**
 * W6-E1-S3 / W6-E6 — formal org → Board reporting. One lifecycle for both
 * report types (progress | financial): submitted → under_review →
 * accepted | returned; a returned report is corrected and resubmitted.
 * Attachments ride the File model (referenceType 'organization_report' via
 * the org's content block). Reports are Board-reviewed from the queue;
 * obligations/overdue flags derive from FundingAgreement schedules.
 */
@Injectable()
export class OrgReportingService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notifications: NotificationsService,
    private obligations: ReportingObligationsService,
  ) {}

  // ─── Submission (org side) ───────────────────────────────────────────────────

  async submitReport(actor: ActorContext, organizationId: number, dto: SubmitReportDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException(`Organization #${organizationId} not found`);
    this.assertActsForOrg(actor, organizationId);

    if (dto.fundingAgreementId != null) {
      const agreement = await this.prisma.fundingAgreement.findUnique({
        where: { id: dto.fundingAgreementId },
      });
      if (!agreement || agreement.organizationId !== organizationId) {
        throw new BadRequestException('Funding agreement does not belong to this organization');
      }
    }
    if (dto.projectId != null) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);
      const executes =
        project.ownerOrganizationId === organizationId ||
        (await this.prisma.projectParticipation.findFirst({
          where: { projectId: dto.projectId, organizationId, status: 'active', deletedAt: null },
        })) !== null;
      if (!executes) {
        throw new BadRequestException('Organization neither owns nor participates in this project');
      }
    }

    const report = await this.prisma.organizationReport.create({
      data: {
        type: dto.type,
        organizationId,
        projectId: dto.projectId,
        fundingAgreementId: dto.fundingAgreementId,
        title: dto.title,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
        submittedByUserId: actor.userId,
      },
    });

    this.eventBus.publish({
      event: 'report.submitted',
      actor,
      subject: { type: 'organization_report', id: report.id },
      data: { organizationId, reportType: dto.type, fundingAgreementId: dto.fundingAgreementId ?? null },
    });
    return report;
  }

  /** Returned-with-comments path: the org corrects and resubmits the same row. */
  async resubmit(actor: ActorContext, reportId: number, dto: Partial<SubmitReportDto>) {
    const report = await this.reportOr404(reportId);
    this.assertActsForOrg(actor, report.organizationId);
    if (report.status !== 'returned') {
      throw new BadRequestException(`Only returned reports can be resubmitted (status: ${report.status})`);
    }

    const updated = await this.prisma.organizationReport.update({
      where: { id: reportId },
      data: {
        title: dto.title ?? report.title,
        payload: (dto.payload ?? report.payload ?? {}) as Prisma.InputJsonValue,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : report.periodStart,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : report.periodEnd,
        status: 'submitted',
        submittedByUserId: actor.userId,
        submittedAt: new Date(),
        reviewedByUserId: null,
        reviewedAt: null,
      },
    });
    this.eventBus.publish({
      event: 'report.submitted',
      actor,
      subject: { type: 'organization_report', id: reportId },
      data: { organizationId: report.organizationId, reportType: report.type, resubmission: true },
    });
    return updated;
  }

  // ─── Review (Board side) ─────────────────────────────────────────────────────

  async beginReview(actor: ActorContext, reportId: number) {
    const report = await this.reportOr404(reportId);
    this.assertTransition(report.status, 'under_review');
    const updated = await this.prisma.organizationReport.update({
      where: { id: reportId },
      data: { status: 'under_review', reviewedByUserId: actor.userId },
    });
    this.eventBus.publish({
      event: 'report.review_started',
      actor,
      subject: { type: 'organization_report', id: reportId },
      data: { organizationId: report.organizationId, reportType: report.type },
    });
    return updated;
  }

  async accept(actor: ActorContext, reportId: number, note?: string) {
    return this.review(actor, reportId, 'accepted', note);
  }

  /** Returned to the org with mandatory comments. */
  async returnWithComments(actor: ActorContext, reportId: number, note: string) {
    if (!note?.trim()) throw new BadRequestException('Returning a report requires review comments');
    return this.review(actor, reportId, 'returned', note);
  }

  private async review(actor: ActorContext, reportId: number, verdict: 'accepted' | 'returned', note?: string) {
    const report = await this.reportOr404(reportId);
    this.assertTransition(report.status, verdict);
    const updated = await this.prisma.organizationReport.update({
      where: { id: reportId },
      data: {
        status: verdict,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });
    this.eventBus.publish({
      event: 'report.reviewed',
      actor,
      subject: { type: 'organization_report', id: reportId },
      data: { organizationId: report.organizationId, reportType: report.type, verdict, note: note ?? null },
    });
    // the submitting org hears back immediately
    await this.notifyOrgAdmins(report.organizationId, {
      type: `report_${verdict}`,
      title: verdict === 'accepted' ? 'Report accepted' : 'Report returned with comments',
      body:
        verdict === 'accepted'
          ? `"${report.title}" was accepted by the Board.`
          : `"${report.title}" was returned: ${note}`,
      referenceId: reportId,
      referenceType: 'organization_report',
    });
    return updated;
  }

  // ─── Reads ───────────────────────────────────────────────────────────────────

  async listForOrg(organizationId: number, status?: OrgReportStatus) {
    return this.prisma.organizationReport.findMany({
      where: { organizationId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { id: 'desc' },
      include: {
        fundingAgreement: { select: { id: true, title: true } },
        project: { select: { id: true } },
      },
    });
  }

  /** Board inbox: reports awaiting review + overdue obligations per agreement. */
  async queue() {
    const reports = await this.prisma.organizationReport.findMany({
      where: { status: { in: ['submitted', 'under_review'] }, deletedAt: null },
      orderBy: { submittedAt: 'asc' },
      include: {
        organization: { select: { id: true, name: true, type: true } },
        fundingAgreement: { select: { id: true, title: true } },
      },
    });

    const agreements = await this.prisma.fundingAgreement.findMany({
      where: { status: 'active', deletedAt: null },
      include: { organization: { select: { id: true, name: true, type: true } } },
    });
    const overdue = [] as Array<{
      agreementId: number;
      agreementTitle: string;
      organization: { id: number; name: string; type: string };
      obligations: Awaited<ReturnType<ReportingObligationsService['obligationsFor']>>;
    }>;
    for (const agreement of agreements) {
      const overdueObligations = (await this.obligations.obligationsFor(agreement)).filter((o) => o.overdue);
      if (overdueObligations.length > 0) {
        overdue.push({
          agreementId: agreement.id,
          agreementTitle: agreement.title,
          organization: agreement.organization,
          obligations: overdueObligations,
        });
      }
    }
    return { reports, overdue };
  }

  // ─── Schedule job (W6-E1-S3: due/overdue notifications) ─────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async dailyObligationSweep(): Promise<{ overdueAgreements: number }> {
    const agreements = await this.prisma.fundingAgreement.findMany({
      where: { status: 'active', deletedAt: null },
    });
    let overdueAgreements = 0;
    for (const agreement of agreements) {
      const overdue = (await this.obligations.obligationsFor(agreement)).filter((o) => o.overdue);
      if (overdue.length === 0) continue;
      overdueAgreements += 1;
      this.eventBus.publish({
        event: 'report.overdue',
        actor: systemActor(),
        subject: { type: 'funding_agreement', id: agreement.id },
        data: {
          organizationId: agreement.organizationId,
          obligations: overdue.map((o) => ({ type: o.type, periodEnd: o.periodEnd.toISOString(), dueAt: o.dueAt.toISOString() })),
        },
      });
      await this.notifyOrgAdmins(agreement.organizationId, {
        type: 'report_overdue',
        title: 'Reporting overdue',
        body: `${overdue.length} report(s) under "${agreement.title}" are overdue — disbursements may be blocked until they are submitted.`,
        referenceId: agreement.id,
        referenceType: 'funding_agreement',
      });
    }
    return { overdueAgreements };
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async reportOr404(id: number) {
    const report = await this.prisma.organizationReport.findFirst({ where: { id, deletedAt: null } });
    if (!report) throw new NotFoundException(`Report #${id} not found`);
    return report;
  }

  /** Route grants can't pin the org for /org-reports/:id paths — re-check here. */
  private assertActsForOrg(actor: ActorContext, organizationId: number): void {
    if (actor.userId == null) return; // system paths
    if (actor.activeOrgId == null) return; // platform workspace (Board) — policy layer gated
    if (actor.activeOrgId !== organizationId) {
      throw new ForbiddenException('You can only submit reports for your active organization');
    }
  }

  private assertTransition(from: OrgReportStatus, to: OrgReportStatus): void {
    const allowed: Record<OrgReportStatus, OrgReportStatus[]> = {
      submitted: ['under_review'],
      under_review: ['accepted', 'returned'],
      accepted: [],
      returned: ['submitted'],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(`Cannot move a report from "${from}" to "${to}"`);
    }
  }

  private async notifyOrgAdmins(
    organizationId: number,
    notification: { type: string; title: string; body: string; referenceId: number; referenceType: string },
  ): Promise<void> {
    const admins = await this.prisma.roleAssignment.findMany({
      where: { scopeType: 'organization', scopeId: organizationId, role: { in: ['org_admin', 'project_manager'] } },
      select: { userId: true },
    });
    for (const userId of [...new Set(admins.map((a) => a.userId))]) {
      await this.notifications
        .createNotificationRecord({ userId, ...notification })
        .catch(() => null); // notifications are best-effort side channels
    }
  }
}
