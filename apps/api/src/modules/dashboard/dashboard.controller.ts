import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
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
