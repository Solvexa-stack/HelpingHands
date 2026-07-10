import { Module } from '@nestjs/common';
import { TransparencyModule } from '../transparency/transparency.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Legacy operational dashboard; platform financials delegate to the W7 read layer. */
@Module({
  imports: [TransparencyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
