import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

// BUG-9 fix (pilot consolidation): the admin dashboard is staff-only — it
// serves per-donation rows incl. donor names; participants were able to read
// it. The admin app is the only consumer (verified: apps/web never calls it).
@ApiTags('Dashboard')
@Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
@Controller({ path: 'dashboard', version: '1' })
@ApiBearerAuth('JWT')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics (role-filtered)' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getStats(user.role, user.referenceId);
  }

  @Get('recent-donations')
  @ApiOperation({ summary: 'Get recent donations' })
  getRecentDonations(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getRecentDonations(user.role, user.referenceId);
  }

  @Get('recent-projects')
  @ApiOperation({ summary: 'Get recent projects' })
  getRecentProjects(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getRecentProjects(user.role, user.referenceId);
  }

  @Get('donations-by-month')
  @ApiOperation({ summary: 'Get monthly donation chart data' })
  getDonationsByMonth(@Query('year') year?: number) {
    return this.dashboardService.getDonationsByMonth(year);
  }
}
