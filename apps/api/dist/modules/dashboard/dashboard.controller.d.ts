import { DashboardService } from './dashboard.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class DashboardController {
    private dashboardService;
    constructor(dashboardService: DashboardService);
    getStats(user: JwtPayload): Promise<{
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
    getRecentDonations(user: JwtPayload): Promise<any>;
    getRecentProjects(user: JwtPayload): Promise<any>;
    getDonationsByMonth(year?: number): Promise<{
        month: number;
        count: number;
        amount: number;
    }[]>;
}
