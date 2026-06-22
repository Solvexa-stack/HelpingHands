import { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class ReportsController {
    private reportsService;
    constructor(reportsService: ReportsService);
    pdfSummary(id: number, res: Response): Promise<void>;
    pdfFinancial(id: number, res: Response): Promise<void>;
    pdfProgress(id: number, res: Response): Promise<void>;
    excelFinancial(id: number, res: Response): Promise<void>;
    excelDonations(id: number, res: Response): Promise<void>;
    excelExpenses(id: number, res: Response): Promise<void>;
}
