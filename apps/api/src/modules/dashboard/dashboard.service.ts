import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRole, DonationStatus, StudyStatus } from '@prisma/client';
import { TenancyRepository } from '../policy/tenancy.repository';
import { TransparencyReadService } from '../transparency/transparency-read.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private tenancy: TenancyRepository,
    private readLayer: TransparencyReadService,
  ) {}

  async getStats(role: string, adminId?: number) {
    const projectWhere: any = {};
    const donationWhere: any = {};
    const studyWhere: any = {};

    if (role === AdminRole.financial_officer && adminId) {
      projectWhere.financialOfficerId = adminId;
      donationWhere.project = { financialOfficerId: adminId };
    }

    // W2 isolation: org workspaces see their own numbers only (Board bypass audited)
    const orgId = await this.tenancy.enforcedOrgId('dashboard.stats');
    if (orgId != null) {
      projectWhere.ownerOrganizationId = orgId;
      donationWhere.project = { ...(donationWhere.project ?? {}), ownerOrganizationId: orgId };
      studyWhere.project = { ownerOrganizationId: orgId };
    }

    const [
      totalProjects,
      completedProjects,
      totalDonations,
      pendingDonations,
      approvedDonations,
      rejectedDonations,
      totalParticipants,
      totalEmployees,
      totalFinancialOfficers,
      totalCollected,
      pendingVotes,
      studiesByStatusGroups,
    ] = await Promise.all([
      // eslint-disable-next-line no-unscoped-org-reads -- scoped: projectWhere carries tenancy.enforcedOrgId above
      this.prisma.project.count({ where: projectWhere }),
      // eslint-disable-next-line no-unscoped-org-reads -- scoped: projectWhere carries tenancy.enforcedOrgId above
      this.prisma.project.count({ where: { ...projectWhere, isCompleted: true } }),
      this.prisma.projectDonation.count({ where: donationWhere }),
      this.prisma.projectDonation.count({ where: { ...donationWhere, status: DonationStatus.pending } }),
      this.prisma.projectDonation.count({ where: { ...donationWhere, status: DonationStatus.approved } }),
      this.prisma.projectDonation.count({ where: { ...donationWhere, status: DonationStatus.rejected } }),
      role === AdminRole.administrator ? this.prisma.participant.count() : Promise.resolve(0),
      role === AdminRole.administrator ? this.prisma.admin.count({ where: { role: AdminRole.employee } }) : Promise.resolve(0),
      role === AdminRole.administrator ? this.prisma.admin.count({ where: { role: AdminRole.financial_officer } }) : Promise.resolve(0),
      this.prisma.projectDonation.aggregate({
        where: { ...donationWhere, status: DonationStatus.approved },
        _sum: { amount: true },
      }),
      this.prisma.projectStudy.count({ where: { ...studyWhere, status: StudyStatus.voting_open } }),
      this.prisma.projectStudy.groupBy({
        by: ['status'],
        where: studyWhere,
        _count: { status: true },
      }),
    ]);

    const studiesByStatus = Object.fromEntries(
      studiesByStatusGroups.map((g) => [g.status, g._count.status]),
    );

    const projectCompletionRate =
      totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

    // W7-E3-S2: the unscoped platform view delegates its headline financial
    // number to the transparency read layer — internal and public figures
    // come from ONE source (contract preserved: same channel, same value).
    let collected = Number(totalCollected._sum.amount || 0);
    if (orgId == null && role === AdminRole.administrator) {
      const stats = await this.readLayer.platformStats();
      collected = TransparencyReadService.totalIntake(stats.data.intakeByChannel);
    }

    return {
      totalProjects,
      completedProjects,
      projectCompletionRate,
      totalDonations,
      pendingDonations,
      approvedDonations,
      rejectedDonations,
      totalCollected: collected,
      pendingVotes,
      studiesByStatus,
      ...(role === AdminRole.administrator && {
        totalParticipants,
        totalEmployees,
        totalFinancialOfficers,
      }),
    };
  }

  async getRecentDonations(role: string, adminId?: number, limit = 10) {
    let where: any = {};
    if (role === AdminRole.financial_officer && adminId) {
      where.project = { financialOfficerId: adminId };
    }
    where = await this.tenancy.enforcedProjectRelationWhere(where, 'dashboard.recent_donations'); // W2 isolation

    return this.prisma.projectDonation.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { include: { block: { include: { translations: { take: 1 } } } } },
        participant: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getRecentProjects(role: string, adminId?: number, limit = 6) {
    let where: any = {};
    if (role === AdminRole.financial_officer && adminId) {
      where.financialOfficerId = adminId;
    }
    where = await this.tenancy.enforcedProjectWhere(where, 'dashboard.recent_projects'); // W2 isolation

    // eslint-disable-next-line no-unscoped-org-reads -- scoped: where carries tenancy.enforcedProjectWhere above
    return this.prisma.project.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        block: {
          include: {
            translations: { take: 1 },
            files: { where: { isCover: true }, take: 1 },
          },
        },
        _count: { select: { donations: true } },
      },
    });
  }

  async getDonationsByMonth(year?: number) {
    const targetYear = year || new Date().getFullYear();
    const start = new Date(`${targetYear}-01-01`);
    const end = new Date(`${targetYear + 1}-01-01`);

    // W2 isolation
    const where = await this.tenancy.enforcedProjectRelationWhere<any>(
      { status: DonationStatus.approved, approvedAt: { gte: start, lt: end } },
      'dashboard.donations_by_month',
    );

    const donations = await this.prisma.projectDonation.findMany({
      where,
      select: { approvedAt: true, amount: true },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: 0,
      amount: 0,
    }));

    for (const d of donations) {
      if (d.approvedAt) {
        const month = d.approvedAt.getMonth();
        months[month].count++;
        months[month].amount += Number(d.amount);
      }
    }

    return months;
  }
}
