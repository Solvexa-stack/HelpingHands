import { Prisma, PrismaClient } from '@prisma/client';

/**
 * W1-E3-S2 — membership & grant backfill (idempotent, re-runnable).
 *
 * Mapping (12_WAVE_1_IDENTITY_MULTI_TENANCY.md):
 *   every admin user        → member of the default org
 *   administrator           → additionally member of the Board org
 *   administrator           → grants: board_chair (platform) + org_admin (default org)
 *   employee                → grant: staff (default org)
 *   financial_officer       → grant: org_accountant (default org)
 *   participants            → no grants
 *
 * Every row this script creates is recorded in the audit log with a
 * `w1-backfill` requestId; re-runs create (and audit) nothing.
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

const REQUEST_ID = 'w1-backfill';

async function audit(
  prisma: PrismaClient,
  action: string,
  subjectType: string,
  subjectId: number,
  after: Record<string, unknown>,
) {
  await prisma.auditLog
    .create({
      data: {
        actorUserId: null,
        action,
        subjectType,
        subjectId: String(subjectId),
        after: after as Prisma.InputJsonValue,
        requestId: REQUEST_ID,
      },
    })
    .catch((err: any) => {
      if (err?.code !== 'P2002') throw err; // idempotent on replays
    });
}

export async function backfillIdentity(prisma: PrismaClient): Promise<{
  membershipsCreated: number;
  grantsCreated: number;
}> {
  const defaultOrg = await prisma.organization.findFirst({
    where: { type: 'ngo', name: 'HelpingHands' },
  });
  const boardOrg = await prisma.organization.findFirst({
    where: { type: 'board', name: 'HelpingHands Board' },
  });
  if (!defaultOrg || !boardOrg) {
    throw new Error('W1-E3-S2: organizations missing — run the W1-E3-S1 backfill/seed first');
  }

  let membershipsCreated = 0;
  let grantsCreated = 0;

  const adminUsers = await prisma.user.findMany({
    where: { referenceType: 'admin', deletedAt: null },
  });

  for (const user of adminUsers) {
    const admin = await prisma.admin.findUnique({ where: { id: user.referenceId } });
    if (!admin) continue;

    const orgIds = [defaultOrg.id];
    if (admin.role === 'administrator') orgIds.push(boardOrg.id);

    for (const organizationId of orgIds) {
      const existing = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId: user.id },
      });
      if (!existing) {
        const membership = await prisma.organizationMembership.create({
          data: { organizationId, userId: user.id },
        });
        membershipsCreated++;
        await audit(prisma, 'membership.added', 'organization_membership', membership.id, {
          organizationId,
          userId: user.id,
          backfill: true,
        });
      }
    }

    for (const grant of ROLE_GRANT_MAPPING[admin.role] ?? []) {
      const scopeId = grant.scopeType === 'organization' ? defaultOrg.id : null;
      const existing = await prisma.roleAssignment.findFirst({
        where: { userId: user.id, role: grant.role, scopeType: grant.scopeType, scopeId },
      });
      if (!existing) {
        const assignment = await prisma.roleAssignment.create({
          data: { userId: user.id, role: grant.role, scopeType: grant.scopeType, scopeId },
        });
        grantsCreated++;
        await audit(prisma, 'role.granted', 'role_assignment', assignment.id, {
          userId: user.id,
          role: grant.role,
          scopeType: grant.scopeType,
          scopeId,
          backfill: true,
        });
      }
    }
  }

  // Verification: every active admin user holds at least one grant
  const activeAdminUsers = await prisma.user.findMany({
    where: { referenceType: 'admin', isActive: true, deletedAt: null },
    select: { id: true },
  });
  for (const { id } of activeAdminUsers) {
    const grants = await prisma.roleAssignment.count({ where: { userId: id, deletedAt: null } });
    if (grants === 0) {
      throw new Error(`W1-E3-S2 verification failed: admin user #${id} has no grants`);
    }
  }

  return { membershipsCreated, grantsCreated };
}

/**
 * Enum ↔ grant parity (W1-E3-S3). Returns one entry per admin user whose
 * AdminRole does not match the grants the mapping requires.
 */
export async function checkRoleParity(prisma: PrismaClient): Promise<
  Array<{ userId: number; role: string; missing: string[] }>
> {
  const drift: Array<{ userId: number; role: string; missing: string[] }> = [];
  const adminUsers = await prisma.user.findMany({
    where: { referenceType: 'admin', isActive: true, deletedAt: null },
  });

  for (const user of adminUsers) {
    const admin = await prisma.admin.findUnique({ where: { id: user.referenceId } });
    if (!admin) continue;
    const grants = await prisma.roleAssignment.findMany({
      where: { userId: user.id, deletedAt: null },
    });
    const missing = (ROLE_GRANT_MAPPING[admin.role] ?? [])
      .filter((g) => !grants.some((row) => row.role === g.role && row.scopeType === g.scopeType))
      .map((g) => `${g.role}@${g.scopeType}`);
    if (missing.length > 0) drift.push({ userId: user.id, role: admin.role, missing });
  }

  return drift;
}
