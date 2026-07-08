import { INestApplication } from '@nestjs/common';
import { execSync } from 'child_process';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleParityService } from '../src/modules/admins/role-parity.service';
import { createTestApp } from './utils/app';
import { SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { DATABASE_PACKAGE_DIR } from './test-env';

/**
 * W1-E3 — backfill results (S1/S2) and the parity job (S3), against the
 * seeded database (the seed runs the same idempotent backfill).
 */
describe('Identity backfill & role parity (W1-E3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let parity: RoleParityService;

  const userByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    parity = app.get(RoleParityService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('default and Board organizations exist; every project is owned (S1)', async () => {
    const defaultOrg = await prisma.organization.findFirst({ where: { type: 'ngo', name: 'HelpingHands' } });
    const board = await prisma.organization.findFirst({ where: { type: 'board' } });
    expect(defaultOrg).not.toBeNull();
    expect(defaultOrg!.capabilities).toMatchObject({ canExecuteProjects: true });
    expect(board).not.toBeNull();

    const orphans = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*)::bigint AS count FROM projects WHERE owner_organization_id IS NULL',
    );
    expect(Number(orphans[0].count)).toBe(0);
  });

  it('admins are members of the default org; the administrator also sits on the Board (S2)', async () => {
    const defaultOrg = (await prisma.organization.findFirst({ where: { type: 'ngo' } }))!;
    const board = (await prisma.organization.findFirst({ where: { type: 'board' } }))!;

    for (const role of ['administrator', 'employee', 'financial_officer'] as const) {
      const user = await userByEmail(SEED_ACCOUNTS[role].email);
      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: defaultOrg.id, userId: user!.id },
      });
      expect(membership).not.toBeNull();
    }

    const adminUser = await userByEmail(SEED_ACCOUNTS.administrator.email);
    expect(
      await prisma.organizationMembership.findFirst({
        where: { organizationId: board.id, userId: adminUser!.id },
      }),
    ).not.toBeNull();

    const participantUser = await userByEmail(SEED_ACCOUNTS.participant.email);
    expect(
      await prisma.organizationMembership.count({ where: { userId: participantUser!.id } }),
    ).toBe(0);
  });

  it('grants follow the mapping; participants have none (S2)', async () => {
    const defaultOrg = (await prisma.organization.findFirst({ where: { type: 'ngo' } }))!;
    const expectGrants = async (email: string, expected: Array<[string, string, number | null]>) => {
      const user = await userByEmail(email);
      const grants = await prisma.roleAssignment.findMany({ where: { userId: user!.id } });
      expect(grants.map((g) => [g.role, g.scopeType, g.scopeId]).sort()).toEqual(expected.sort());
    };

    await expectGrants(SEED_ACCOUNTS.administrator.email, [
      ['board_chair', 'platform', null],
      ['org_admin', 'organization', defaultOrg.id],
    ]);
    await expectGrants(SEED_ACCOUNTS.employee.email, [['staff', 'organization', defaultOrg.id]]);
    await expectGrants(SEED_ACCOUNTS.financial_officer.email, [
      ['org_accountant', 'organization', defaultOrg.id],
    ]);
    await expectGrants(SEED_ACCOUNTS.participant.email, []);
  });

  it('the backfill is audited and re-runnable without duplicates (S2 AC)', async () => {
    const audited = await prisma.auditLog.count({ where: { requestId: 'w1-backfill' } });
    expect(audited).toBeGreaterThanOrEqual(8); // 4 memberships + 4 grants

    const [membershipsBefore, grantsBefore] = [
      await prisma.organizationMembership.count(),
      await prisma.roleAssignment.count(),
    ];

    execSync('pnpm db:backfill:w1', { cwd: DATABASE_PACKAGE_DIR, env: { ...process.env }, stdio: 'pipe' });

    expect(await prisma.organizationMembership.count()).toBe(membershipsBefore);
    expect(await prisma.roleAssignment.count()).toBe(grantsBefore);
  });

  it('parity job is green post-backfill (S3)', async () => {
    expect(await parity.check()).toEqual([]);
    expect(await parity.nightlyCheck()).toEqual([]);
  });

  it('role change dual-writes grants, syncs the enum and stays parity-green (W1-E6-S1)', async () => {
    const { authHeaderFor } = require('./utils/auth');
    const request = require('supertest');
    const admin = await authHeaderFor(prisma, 'administrator');
    const employeeUser = await userByEmail(SEED_ACCOUNTS.employee.email);

    await request(app.getHttpServer())
      .put(`/api/v1/admins/${employeeUser!.referenceId}`)
      .set('Authorization', admin)
      .send({ role: 'financial_officer' })
      .expect(200);

    const grants = await prisma.roleAssignment.findMany({ where: { userId: employeeUser!.id } });
    expect(grants.map((g) => g.role)).toEqual(['org_accountant']); // staff revoked, accountant granted
    const adminRow = await prisma.admin.findUnique({ where: { id: employeeUser!.referenceId } });
    expect(adminRow!.role).toBe('financial_officer'); // enum synced
    expect(await parity.check()).toEqual([]); // parity green

    for (let i = 0; i < 30; i++) {
      const granted = await prisma.auditLog.findFirst({ where: { action: 'role.granted', requestId: { not: 'w1-backfill' } } });
      const revoked = await prisma.auditLog.findFirst({ where: { action: 'role.revoked' } });
      if (granted && revoked) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('role.granted/revoked never reached the audit log');
  });

  it('injected drift trips the alert: role_parity.drifted lands in the audit trail (S3 AC)', async () => {
    const employeeUser = await userByEmail(SEED_ACCOUNTS.employee.email);
    await prisma.roleAssignment.deleteMany({ where: { userId: employeeUser!.id } });

    const drift = await parity.nightlyCheck();
    // The previous test promoted the employee to financial_officer
    expect(drift).toEqual([
      { userId: employeeUser!.id, role: 'financial_officer', missing: ['org_accountant@organization'] },
    ]);

    // The alert event reaches the audit log
    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({ where: { action: 'role_parity.drifted' } });
      if (row) {
        expect(row.after).toMatchObject({ drift: [{ userId: employeeUser!.id }] });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('role_parity.drifted never reached the audit log');
  });
});
