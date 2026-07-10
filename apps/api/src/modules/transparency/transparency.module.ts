import { Module } from '@nestjs/common';
import { OrgReportingModule } from '../org-reporting/org-reporting.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { DashboardsController } from './dashboards.controller';
import { ExportsController } from './exports.controller';
import { PublicationPolicyController } from './publication-policy.controller';
import { PublicationPolicyService } from './publication-policy.service';
import { TransparencyController } from './transparency.controller';
import { TransparencyReadService } from './transparency-read.service';
import { TransparencyRefreshSubscriber } from './transparency-refresh.subscriber';

/**
 * W7 — Reporting & Transparency: the read layer (cached aggregates, event-
 * driven refresh), Board-controlled publication policy, public portal
 * endpoints (rate-limited), dashboards, and statement exports. Read-only:
 * no new domain truth.
 */
@Module({
  imports: [TreasuryModule, OrgReportingModule],
  controllers: [
    TransparencyController,
    PublicationPolicyController,
    DashboardsController,
    ExportsController,
  ],
  providers: [TransparencyReadService, PublicationPolicyService, TransparencyRefreshSubscriber],
  exports: [TransparencyReadService, PublicationPolicyService],
})
export class TransparencyModule {}
