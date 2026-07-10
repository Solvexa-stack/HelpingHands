import { Injectable } from '@nestjs/common';
import { FundingAgreement, OrgReportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReportingObligation {
  type: OrgReportType;
  periodStart: Date;
  periodEnd: Date;
  dueAt: Date;
  satisfied: boolean;
  overdue: boolean;
}

interface Schedule {
  frequency?: 'monthly' | 'quarterly' | 'none';
  reportTypes?: OrgReportType[];
}

interface Terms {
  blockDisbursementsOnOverdueReports?: boolean;
  graceDays?: number;
}

/**
 * W6-E1-S2/S3 — reporting obligations derived from a FundingAgreement's
 * schedule. Obligations are COMPUTED, never stored: for every fully elapsed
 * period since the agreement's anchor date, one report of each scheduled type
 * must exist (submitted | under_review | accepted — a returned report does
 * not satisfy its period). Overdue = unsatisfied past periodEnd + graceDays.
 */
@Injectable()
export class ReportingObligationsService {
  constructor(private prisma: PrismaService) {}

  async obligationsFor(agreement: FundingAgreement, now = new Date()): Promise<ReportingObligation[]> {
    if (agreement.status !== 'active') return [];
    const schedule = (agreement.reportingSchedule ?? {}) as Schedule;
    const frequency = schedule.frequency ?? 'none';
    if (frequency === 'none') return [];
    const reportTypes = schedule.reportTypes?.length ? schedule.reportTypes : (['progress'] as OrgReportType[]);
    const stepMonths = frequency === 'monthly' ? 1 : 3;
    const anchor = agreement.startsAt ?? agreement.signedAt ?? agreement.createdAt;
    const graceDays = ((agreement.terms ?? {}) as Terms).graceDays ?? 0;
    const horizon = agreement.endsAt && agreement.endsAt < now ? agreement.endsAt : now;

    const reports = await this.prisma.organizationReport.findMany({
      where: {
        fundingAgreementId: agreement.id,
        status: { in: ['submitted', 'under_review', 'accepted'] },
        deletedAt: null,
      },
    });

    const obligations: ReportingObligation[] = [];
    let periodStart = new Date(anchor);
    for (;;) {
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + stepMonths);
      if (periodEnd > horizon) break;
      const dueAt = new Date(periodEnd.getTime() + graceDays * 86_400_000);
      for (const type of reportTypes) {
        // a report satisfies the period when its own period overlaps it
        const satisfied = reports.some((r) => {
          if (r.type !== type) return false;
          const rEnd = r.periodEnd ?? r.submittedAt;
          const rStart = r.periodStart ?? rEnd;
          return rStart < periodEnd && rEnd >= periodStart;
        });
        obligations.push({
          type,
          periodStart: new Date(periodStart),
          periodEnd,
          dueAt,
          satisfied,
          overdue: !satisfied && dueAt < now,
        });
      }
      periodStart = periodEnd;
    }
    return obligations;
  }

  async overdueFor(agreementId: number, now = new Date()): Promise<ReportingObligation[]> {
    const agreement = await this.prisma.fundingAgreement.findUnique({ where: { id: agreementId } });
    if (!agreement) return [];
    return (await this.obligationsFor(agreement, now)).filter((o) => o.overdue);
  }
}
