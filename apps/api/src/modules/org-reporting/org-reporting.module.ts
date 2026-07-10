import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrgReportsController, ReportReviewController } from './org-reporting.controller';
import { OrgReportingService } from './org-reporting.service';
import { ReportingObligationsService } from './reporting-obligations.service';

/**
 * W6-E1-S3 / W6-E6 — formal org → Board reporting (progress | financial) and
 * the obligation computation FundingAgreement disbursement blocks rely on.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [OrgReportsController, ReportReviewController],
  providers: [OrgReportingService, ReportingObligationsService],
  exports: [OrgReportingService, ReportingObligationsService],
})
export class OrgReportingModule {}
