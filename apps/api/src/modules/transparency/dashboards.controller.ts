import { Controller, ForbiddenException, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgReportingService } from '../org-reporting/org-reporting.service';
import { ReportingObligationsService } from '../org-reporting/reporting-obligations.service';
import { TransparencyReadService } from './transparency-read.service';

/**
 * W7-E3 — dashboards on the read layer. Board: cross-entity KPIs, funds
 * comparison, overdue reports, decision throughput. Org: portfolio, funding
 * received, report calendar. Fund: monthly trends. Internal numbers and
 * public numbers come from the SAME aggregates — parity by construction.
 */
@ApiTags('Dashboards (read layer)')
@ApiBearerAuth('JWT')
@Controller({ path: 'dashboards', version: '1' })
export class DashboardsController {
  constructor(
    private prisma: PrismaService,
    private readService: TransparencyReadService,
    private reporting: OrgReportingService,
    private obligations: ReportingObligationsService,
  ) {}

  @Get('board')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board dashboard: KPIs, funds comparison, overdue reports, decision throughput' })
  async board() {
    const [stats, reportQueue, decisions30d, decisionsByType, openStudies] = await Promise.all([
      this.readService.platformStats(),
      this.reporting.queue(),
      this.prisma.boardDecision.count({
        where: { decidedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
      this.prisma.boardDecision.groupBy({ by: ['decision'], _count: { id: true } }),
      this.prisma.projectStudy.findMany({
        where: { status: { in: ['in_review', 'voting_open', 'voting_closed'] } },
        select: { updatedAt: true },
      }),
    ]);

    const now = Date.now();
    const queueAges = openStudies.map((s) => (now - s.updatedAt.getTime()) / 86_400_000).sort((a, b) => a - b);
    const medianQueueAgeDays =
      queueAges.length === 0 ? 0 : Math.round(queueAges[Math.floor(queueAges.length / 2)] * 10) / 10;

    return {
      asOf: stats.asOf,
      platform: stats.data,
      decisionThroughput: {
        last30Days: decisions30d,
        byType: Object.fromEntries(decisionsByType.map((d) => [d.decision, d._count.id])),
        openQueueSize: queueAges.length,
        medianQueueAgeDays,
      },
      reports: {
        awaitingReview: reportQueue.reports.length,
        overdueAgreements: reportQueue.overdue.length,
        overdue: reportQueue.overdue,
      },
    };
  }

  @Get('org')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Org workspace dashboard: portfolio, funding received, report calendar' })
  async org(@CurrentActor() actor: ActorContext) {
    if (actor.activeOrgId == null) {
      throw new ForbiddenException('Select an organization workspace');
    }
    const orgId = actor.activeOrgId;
    const [portfolio, agreements, reports] = await Promise.all([
      this.readService.orgPublic(orgId),
      this.prisma.fundingAgreement.findMany({
        where: { organizationId: orgId, status: 'active', deletedAt: null },
      }),
      this.reporting.listForOrg(orgId),
    ]);

    // funding received = disbursed tranches into this org's project accounts
    const projectIds = portfolio.data.portfolio.map((p) => p.id);
    const allocations = projectIds.length
      ? await this.prisma.fundAllocation.findMany({
          where: { projectId: { in: projectIds }, status: { notIn: ['rejected', 'proposed'] } },
          select: { id: true, amount: true, fund: { select: { id: true, name: true } } },
        })
      : [];

    const calendar = [] as Array<Record<string, unknown>>;
    for (const agreement of agreements) {
      const items = await this.obligations.obligationsFor(agreement);
      calendar.push(
        ...items
          .filter((o) => !o.satisfied)
          .map((o) => ({
            agreementId: agreement.id,
            agreementTitle: agreement.title,
            type: o.type,
            periodStart: o.periodStart,
            periodEnd: o.periodEnd,
            dueAt: o.dueAt,
            overdue: o.overdue,
          })),
      );
    }

    return {
      asOf: portfolio.asOf,
      portfolio: portfolio.data.totals,
      projects: portfolio.data.portfolio,
      fundingReceived: {
        allocations: allocations.map((a) => ({ fund: a.fund, amount: Number(a.amount) })),
        totalAllocated: Math.round(allocations.reduce((s, a) => s + Number(a.amount), 0) * 100) / 100,
      },
      reportCalendar: calendar,
      recentReports: reports.slice(0, 10),
    };
  }

  @Get('funds/:id/trends')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Fund monthly intake/outflow trends (W5 dashboard upgrade)' })
  trends(@Param('id', ParseIntPipe) fundId: number) {
    return this.readService.fundTrends(fundId);
  }
}
