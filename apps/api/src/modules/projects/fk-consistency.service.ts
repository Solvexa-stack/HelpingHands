import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

const D1_TABLES = [
  'project_steps',
  'project_phases',
  'project_tasks',
  'project_budgets',
  'project_expenses',
  'project_transactions',
  'project_milestones',
] as const;

/**
 * W2-E1-S3 — nightly legacy-Block-FK ↔ new-Project-FK pair check across the
 * seven D1 tables. Runs until Wave 8 drops the legacy columns. Mismatches
 * raise an error log and a `fk_parity.drifted` event (→ audit trail).
 */
@Injectable()
export class FkConsistencyService {
  private readonly logger = new Logger(FkConsistencyService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async nightlyCheck(): Promise<Record<string, number>> {
    const mismatches = await this.check();
    const total = Object.values(mismatches).reduce((a, b) => a + b, 0);
    if (total > 0) {
      this.logger.error(`D1 FK-pair drift: ${JSON.stringify(mismatches)}`);
      this.eventBus.publish({
        event: 'fk_parity.drifted',
        actor: systemActor(),
        subject: { type: 'fk_parity', id: 'nightly-check' },
        data: { mismatches },
      });
    } else {
      this.logger.log('D1 FK-pair check clean');
    }
    return mismatches;
  }

  /** Rows whose project_ref_id disagrees with the Block↔Project mapping (or is null). */
  async check(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const table of D1_TABLES) {
      const rows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count
         FROM "${table}" t
         LEFT JOIN projects p ON p.block_id = t.project_id
         WHERE t.project_ref_id IS DISTINCT FROM p.id`,
      );
      const count = Number(rows[0].count);
      if (count > 0) result[table] = count;
    }
    return result;
  }
}
