import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StudyStatus } from '@prisma/client';
import { DomainEvent } from '../../events/domain-event';
import { PrismaService } from '../../prisma/prisma.service';
import { GovernanceService } from './governance.service';

/**
 * W4-E4-S3 — vote rounds become engine effects: entering voting emits
 * `vote_round.create`, leaving emits `vote_round.close` (the engine emits
 * them post-commit, synchronously in-process). The round machinery itself
 * (W3) is unchanged — only the trigger moved from a service call to an
 * effect subscription.
 */
@Injectable()
export class WorkflowEffectsSubscriber {
  private readonly logger = new Logger(WorkflowEffectsSubscriber.name);

  constructor(
    private prisma: PrismaService,
    private governance: GovernanceService,
  ) {}

  @OnEvent('vote_round.create')
  async onRoundCreate(event: DomainEvent<{ toState?: string }>) {
    if (event.subject.type !== 'project') return;
    const study = await this.prisma.projectStudy.findUnique({
      where: { projectId: Number(event.subject.id) },
    });
    if (!study) return;
    await this.governance
      .syncRoundOnStudyStatus(event.actor, study, StudyStatus.voting_open, study.votingEndsAt ?? undefined)
      .catch((err) => this.logger.error(`vote_round.create effect failed: ${err.message}`));
  }

  @OnEvent('vote_round.close')
  async onRoundClose(event: DomainEvent<{ toState?: string }>) {
    if (event.subject.type !== 'project') return;
    const study = await this.prisma.projectStudy.findUnique({
      where: { projectId: Number(event.subject.id) },
    });
    if (!study) return;
    await this.governance
      .syncRoundOnStudyStatus(event.actor, study, StudyStatus.voting_closed)
      .catch((err) => this.logger.error(`vote_round.close effect failed: ${err.message}`));
  }
}
