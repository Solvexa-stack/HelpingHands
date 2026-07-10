import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransparencyReadService } from './transparency-read.service';

/**
 * W7-E1-S1 AC — aggregates refresh on domain events: every money fact
 * (`ledger.posted`), lifecycle move (`workflow.transitioned`), governance
 * decision, and report/agreement change clears the read-layer cache; the
 * 60s TTL is the scheduled fallback.
 */
@Injectable()
export class TransparencyRefreshSubscriber {
  constructor(private readService: TransparencyReadService) {}

  @OnEvent('ledger.posted')
  @OnEvent('workflow.transitioned')
  @OnEvent('board_decision.recorded')
  @OnEvent('donation.approved')
  @OnEvent('payment.completed')
  @OnEvent('allocation.disbursed')
  @OnEvent('report.reviewed')
  @OnEvent('agreement.signed')
  @OnEvent('organization.updated')
  @OnEvent('capability.changed')
  @OnEvent('project.created')
  @OnEvent('project.updated')
  @OnEvent('project.closed')
  @OnEvent('participation.added')
  @OnEvent('fund.created')
  @OnEvent('fund.updated')
  onDomainChange(): void {
    this.readService.invalidate();
  }
}
