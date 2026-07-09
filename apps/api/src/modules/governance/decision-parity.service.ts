import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StudyStatus } from '@prisma/client';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DecisionParityDrift {
  studyId: number;
  problem: string;
}

/**
 * W3-E4-S2 — nightly ProjectStudy ↔ BoardDecision parity check. Every
 * approved/rejected study must have a matching decision row (and vice versa).
 * Runs until Wave 8 retires the legacy columns. Drift raises an error log AND
 * a `decision_parity.drifted` domain event (→ audit trail) — the alert
 * channel until real alerting infrastructure exists (same pattern as the
 * W1-E3-S3 role-parity job).
 */
@Injectable()
export class DecisionParityService {
  private readonly logger = new Logger(DecisionParityService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async nightlyCheck(): Promise<DecisionParityDrift[]> {
    const drift = await this.check();
    if (drift.length > 0) {
      this.logger.error(`Decision parity drift detected: ${JSON.stringify(drift)}`);
      this.eventBus.publish({
        event: 'decision_parity.drifted',
        actor: systemActor(),
        subject: { type: 'decision_parity', id: 'nightly-check' },
        data: { drift },
      });
    } else {
      this.logger.log('Decision parity check clean');
    }
    return drift;
  }

  async check(): Promise<DecisionParityDrift[]> {
    const drift: DecisionParityDrift[] = [];

    const settled = await this.prisma.projectStudy.findMany({
      where: { status: { in: [StudyStatus.approved, StudyStatus.rejected] } },
      select: { id: true, status: true, approvedById: true },
    });
    for (const study of settled) {
      const decision = await this.prisma.boardDecision.findFirst({
        where: {
          subjectType: 'project_study',
          subjectId: study.id,
          decision: study.status === StudyStatus.approved ? 'approved' : 'rejected',
        },
      });
      if (!decision) {
        drift.push({ studyId: study.id, problem: `study is ${study.status} but has no matching BoardDecision` });
      }
    }

    // Reverse direction: a terminal decision whose study no longer reflects it
    // (changes_requested legitimately resets the study, so only terminal kinds checked)
    const terminalDecisions = await this.prisma.boardDecision.findMany({
      where: { subjectType: 'project_study', decision: { in: ['approved', 'rejected'] } },
      orderBy: { decidedAt: 'asc' },
    });
    const latestBySubject = new Map<number, (typeof terminalDecisions)[number]>();
    for (const d of terminalDecisions) latestBySubject.set(d.subjectId, d);
    for (const [studyId, d] of latestBySubject) {
      const study = await this.prisma.projectStudy.findUnique({
        where: { id: studyId },
        select: { status: true },
      });
      if (!study) continue;
      // A later changes_requested/new cycle may supersede — only flag when the
      // study is settled differently from its latest terminal decision.
      const laterRevision = await this.prisma.boardDecision.findFirst({
        where: {
          subjectType: 'project_study',
          subjectId: studyId,
          decision: 'changes_requested',
          decidedAt: { gt: d.decidedAt },
        },
      });
      if (laterRevision) continue;
      if (
        (study.status === StudyStatus.approved || study.status === StudyStatus.rejected) &&
        (study.status as string) !== (d.decision as string)
      ) {
        drift.push({ studyId, problem: `latest decision is ${d.decision} but study is ${study.status}` });
      }
    }

    return drift;
  }
}
