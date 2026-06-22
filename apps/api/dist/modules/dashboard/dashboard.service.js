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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let DashboardService = class DashboardService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getStats(role, adminId) {
        const projectWhere = {};
        const donationWhere = {};
        if (role === client_1.AdminRole.financial_officer && adminId) {
            projectWhere.financialOfficerId = adminId;
            donationWhere.project = { financialOfficerId: adminId };
        }
        const [totalProjects, completedProjects, totalDonations, pendingDonations, approvedDonations, rejectedDonations, totalParticipants, totalEmployees, totalFinancialOfficers, totalCollected, pendingVotes, studiesByStatusGroups,] = await Promise.all([
            this.prisma.project.count({ where: projectWhere }),
            this.prisma.project.count({ where: { ...projectWhere, isCompleted: true } }),
            this.prisma.projectDonation.count({ where: donationWhere }),
            this.prisma.projectDonation.count({ where: { ...donationWhere, status: client_1.DonationStatus.pending } }),
            this.prisma.projectDonation.count({ where: { ...donationWhere, status: client_1.DonationStatus.approved } }),
            this.prisma.projectDonation.count({ where: { ...donationWhere, status: client_1.DonationStatus.rejected } }),
            role === client_1.AdminRole.administrator ? this.prisma.participant.count() : Promise.resolve(0),
            role === client_1.AdminRole.administrator ? this.prisma.admin.count({ where: { role: client_1.AdminRole.employee } }) : Promise.resolve(0),
            role === client_1.AdminRole.administrator ? this.prisma.admin.count({ where: { role: client_1.AdminRole.financial_officer } }) : Promise.resolve(0),
            this.prisma.projectDonation.aggregate({
                where: { ...donationWhere, status: client_1.DonationStatus.approved },
                _sum: { amount: true },
            }),
            this.prisma.projectStudy.count({ where: { status: client_1.StudyStatus.voting_open } }),
            this.prisma.projectStudy.groupBy({
                by: ['status'],
                _count: { status: true },
            }),
        ]);
        const studiesByStatus = Object.fromEntries(studiesByStatusGroups.map((g) => [g.status, g._count.status]));
        const projectCompletionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;
        return {
            totalProjects,
            completedProjects,
            projectCompletionRate,
            totalDonations,
            pendingDonations,
            approvedDonations,
            rejectedDonations,
            totalCollected: Number(totalCollected._sum.amount || 0),
            pendingVotes,
            studiesByStatus,
            ...(role === client_1.AdminRole.administrator && {
                totalParticipants,
                totalEmployees,
                totalFinancialOfficers,
            }),
        };
    }
    async getRecentDonations(role, adminId, limit = 10) {
        const where = {};
        if (role === client_1.AdminRole.financial_officer && adminId) {
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
    async getRecentProjects(role, adminId, limit = 6) {
        const where = {};
        if (role === client_1.AdminRole.financial_officer && adminId) {
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
    async getDonationsByMonth(year) {
        const targetYear = year || new Date().getFullYear();
        const start = new Date(`${targetYear}-01-01`);
        const end = new Date(`${targetYear + 1}-01-01`);
        const donations = await this.prisma.projectDonation.findMany({
            where: {
                status: client_1.DonationStatus.approved,
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
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map