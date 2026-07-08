import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { systemActor } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * W1-E3-S3 — nightly AdminRole ↔ RoleAssignment parity check. Runs until
 * Wave 8 retires the enum. Drift raises an error log AND a
 * `role_parity.drifted` domain event (→ audit trail), which is the alert
 * channel until real alerting infrastructure exists.
 *
 * Keep the mapping in sync with
 * packages/database/prisma/backfills/w1-identity-backfill.ts
 * (both derive from 08_PERMISSIONS_RBAC_ABAC.md; W1-E4 formalizes the catalog).
 */
export const ROLE_GRANT_MAPPING: Record<
  string,
  Array<{ role: string; scopeType: 'platform' | 'organization' }>
> = {
  administrator: [
    { role: 'board_chair', scopeType: 'platform' },
    { role: 'org_admin', scopeType: 'organization' },
  ],
  employee: [{ role: 'staff', scopeType: 'organization' }],
  financial_officer: [{ role: 'org_accountant', scopeType: 'organization' }],
};

export interface RoleParityDrift {
  userId: number;
  role: string;
  missing: string[];
}

@Injectable()
export class RoleParityService {
  private readonly logger = new Logger(RoleParityService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightlyCheck(): Promise<RoleParityDrift[]> {
    const drift = await this.check();
    if (drift.length > 0) {
      this.logger.error(`Role parity drift detected: ${JSON.stringify(drift)}`);
      this.eventBus.publish({
        event: 'role_parity.drifted',
        actor: systemActor(),
        subject: { type: 'role_parity', id: 'nightly-check' },
        data: { drift },
      });
    } else {
      this.logger.log('Role parity check clean');
    }
    return drift;
  }

  async check(): Promise<RoleParityDrift[]> {
    const drift: RoleParityDrift[] = [];
    const adminUsers = await this.prisma.user.findMany({
      where: { referenceType: 'admin', isActive: true },
    });

    for (const user of adminUsers) {
      const admin = await this.prisma.admin.findUnique({ where: { id: user.referenceId } });
      if (!admin) continue;
      const grants = await this.prisma.roleAssignment.findMany({
        where: { userId: user.id },
      });
      const missing = (ROLE_GRANT_MAPPING[admin.role] ?? [])
        .filter((g) => !grants.some((row) => row.role === g.role && row.scopeType === g.scopeType))
        .map((g) => `${g.role}@${g.scopeType}`);
      if (missing.length > 0) drift.push({ userId: user.id, role: admin.role, missing });
    }

    return drift;
  }
}
