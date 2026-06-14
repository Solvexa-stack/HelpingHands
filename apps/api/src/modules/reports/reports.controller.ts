import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.financial_officer)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('projects/:id/pdf/summary')
  @ApiOperation({ summary: 'Download project summary PDF' })
  async pdfSummary(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateProjectSummaryPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-summary.pdf"` });
    res.send(buffer);
  }

  @Get('projects/:id/pdf/financial')
  @ApiOperation({ summary: 'Download financial report PDF' })
  async pdfFinancial(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateFinancialPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-financial.pdf"` });
    res.send(buffer);
  }

  @Get('projects/:id/pdf/progress')
  @ApiOperation({ summary: 'Download progress report PDF' })
  async pdfProgress(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateProgressPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="project-${id}-progress.pdf"` });
    res.send(buffer);
  }

  @Get('projects/:id/excel/financial')
  @ApiOperation({ summary: 'Download financial Excel report' })
  async excelFinancial(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateFinancialExcel(id);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-financial.xlsx"` });
    res.send(buffer);
  }

  @Get('projects/:id/excel/donations')
  @ApiOperation({ summary: 'Download donations Excel report' })
  async excelDonations(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateDonationsExcel(id);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-donations.xlsx"` });
    res.send(buffer);
  }

  @Get('projects/:id/excel/expenses')
  @ApiOperation({ summary: 'Download expenses Excel report' })
  async excelExpenses(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.reportsService.generateExpensesExcel(id);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="project-${id}-expenses.xlsx"` });
    res.send(buffer);
  }
}
