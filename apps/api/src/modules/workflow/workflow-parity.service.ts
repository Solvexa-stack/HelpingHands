import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface WorkflowParityDrift {
  projectId: number;
  problem: string;
}

/**
 * W4-E4-S1 — nightly engine-state ↔ legacy-enum parity check (until Wave 8
 * retires the legacy columns). Mirrors the W1/W3 parity-job pattern: drift
 * raises an error log AND a `workflow_parity.drifted` event (→ audit trail).
 *
 * Derivation mirrors packages/database/prisma/backfills/w4-workflow-backfill.ts
 * — keep the two in sync.
 */
@Injectable()
export class WorkflowParityService {
  private readonly logger = new Logger(WorkflowParityService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  static derive(studyStatus: string | null, isCompleted: boolean): string[] {
    if (isCompleted) return ['completed'];
    // studyStatus null covers two generations: backfilled pre-engine projects
    // (positioned donations_open/executing) AND engine-born projects that
    // have not created a study yet (sitting at the initial draft state) —
    // both are legitimate, not drift (W6 fix of a W4 false positive).
    if (studyStatus === null) return ['draft', 'donations_open', 'executing'];
    if (studyStatus === 'approved') return ['approved', 'donations_open', 'executing'];
    // W6: v2's board_review station has no legacy column equivalent — the
    // study stays voting_closed while the Board holds the project.
    if (studyStatus === 'voting_closed') return ['voting_closed', 'board_review'];
    return [studyStatus];
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async nightlyCheck(): Promise<WorkflowParityDrift[]> {
    const drift = await this.check();
    if (drift.length > 0) {
      this.logger.error(`Workflow parity drift detected: ${JSON.stringify(drift)}`);
      this.eventBus.publish({
        event: 'workflow_parity.drifted',
        actor: systemActor(),
        subject: { type: 'workflow_parity', id: 'nightly-check' },
        data: { drift },
      });
    } else {
      this.logger.log('Workflow parity check clean');
    }
    return drift;
  }

  async check(): Promise<WorkflowParityDrift[]> {
    const drift: WorkflowParityDrift[] = [];
    // eslint-disable-next-line no-unscoped-org-reads -- system parity sweep over all tenants (cron, no actor)
    const projects = await this.prisma.project.findMany({
      select: { id: true, studyStatus: true, isCompleted: true },
    });
    for (const project of projects) {
      const instance = await this.prisma.workflowInstance.findUnique({
        where: { subjectType_subjectId: { subjectType: 'project', subjectId: project.id } },
        include: { definition: { select: { key: true } } },
      });
      if (!instance) {
        drift.push({ projectId: project.id, problem: 'no workflow instance' });
        continue;
      }
      // W6: engine-native definitions (emergency-relief) have no legacy
      // column semantics — nothing to compare against.
      if (instance.definition.key !== 'project-lifecycle') continue;
      const acceptable = WorkflowParityService.derive(project.studyStatus as string | null, project.isCompleted);
      if (!acceptable.includes(instance.currentStateKey)) {
        drift.push({
          projectId: project.id,
          problem: `instance=${instance.currentStateKey}, legacy derives one of [${acceptable.join(', ')}]`,
        });
      }
    }
    return drift;
  }
}
