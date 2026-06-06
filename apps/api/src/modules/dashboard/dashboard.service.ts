import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRole, DonationStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(role: string, adminId?: number) {
    const projectWhere: any = {};
    const donationWhere: any = {};

    if (role === AdminRole.financial_officer && adminId) {
      projectWhere.financialOfficerId = adminId;
      donationWhere.project = { financialOfficerId: adminId };
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
    ] = await Promise.all([
      this.prisma.project.count({ where: projectWhere }),
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
    ]);

    const projectCompletionRate =
      totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

    return {
      totalProjects,
      completedProjects,
      projectCompletionRate,
      totalDonations,
      pendingDonations,
      approvedDonations,
      rejectedDonations,
      totalCollected: Number(totalCollected._sum.amount || 0),
      ...(role === AdminRole.administrator && {
        totalParticipants,
        totalEmployees,
        totalFinancialOfficers,
      }),
    };
  }

  async getRecentDonations(role: string, adminId?: number, limit = 10) {
    const where: any = {};
    if (role === AdminRole.financial_officer && adminId) {
      where.project = { financialOfficerId: adminId };
    }

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
    const where: any = {};
    if (role === AdminRole.financial_officer && adminId) {
      where.financialOfficerId = adminId;
    }

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

    const donations = await this.prisma.projectDonation.findMany({
      where: {
        status: DonationStatus.approved,
        approvedAt: { gte: start, lt: end },
      },
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
