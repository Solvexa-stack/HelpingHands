import { PrismaService } from '../../prisma/prisma.service';
export declare class ReportsService {
    private prisma;
    constructor(prisma: PrismaService);
    private getProject;
    generateProjectSummaryPdf(projectId: number): Promise<Buffer>;
    generateFinancialPdf(projectId: number): Promise<Buffer>;
    generateProgressPdf(projectId: number): Promise<Buffer>;
    generateFinancialExcel(projectId: number): Promise<Buffer>;
    generateDonationsExcel(projectId: number): Promise<Buffer>;
    generateExpensesExcel(projectId: number): Promise<Buffer>;
}
