import { PrismaService } from '../../prisma/prisma.service';
export declare class DashboardService {
    private prisma;
    constructor(prisma: PrismaService);
    getStats(role: string, adminId?: number): Promise<{
        totalParticipants?: any;
        totalEmployees?: any;
        totalFinancialOfficers?: any;
        totalProjects: any;
        completedProjects: any;
        projectCompletionRate: number;
        totalDonations: any;
        pendingDonations: any;
        approvedDonations: any;
        rejectedDonations: any;
        totalCollected: number;
        pendingVotes: any;
        studiesByStatus: {
            [k: string]: any;
        };
    }>;
    getRecentDonations(role: string, adminId?: number, limit?: number): Promise<any>;
    getRecentProjects(role: string, adminId?: number, limit?: number): Promise<any>;
    getDonationsByMonth(year?: number): Promise<{
        month: number;
        count: number;
        amount: number;
    }[]>;
}
