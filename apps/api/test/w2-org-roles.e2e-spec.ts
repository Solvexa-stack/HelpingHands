import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PolicyService } from '../src/modules/policy/policy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * W2-E5-S2 — org-scope role management: granting a catalog role immediately
 * affects can() outcomes; every change audited.
 */
describe('Org member & role management (W2-E5-S2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let policy: PolicyService;
  let admin: string;
  let orgId: number;
  let participantUserId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    policy = app.get(PolicyService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');
    orgId = (await prisma.organization.findFirst({ where: { type: 'ngo' } }))!.id;
    participantUserId = (await prisma.user.findUnique({
      where: { email: SEED_ACCOUNTS.participant.email },
    }))!.id;
    await http().post(`/api/v1/organizations/${orgId}/members`).set('Authorization', admin).send({ userId: participantUserId }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const actor = () => ({ userId: participantUserId, referenceType: 'participant', requestId: 't', ip: null });

  it('granting project_manager immediately affects can() outcomes (AC)', async () => {
    const before = await policy.can(actor(), 'project.donation.open', { organizationId: orgId });
    expect(before.allow).toBe(false);

    await http()
      .post(`/api/v1/organizations/${orgId}/members/${participantUserId}/roles`)
      .set('Authorization', admin)
      .send({ role: 'project_manager' })
      .expect(201);

    // capability precondition on the sample policy
    await prisma.organization.update({
      where: { id: orgId },
      data: { capabilities: { canOpenDonations: true } },
    });
    const after = await policy.can(actor(), 'project.donation.open', { organizationId: orgId });
    expect(after).toMatchObject({ allow: true, reason: `granted:project_manager@organization:${orgId}` });

    // duplicate grant → 409; members list shows roles
    await http().post(`/api/v1/organizations/${orgId}/members/${participantUserId}/roles`).set('Authorization', admin).send({ role: 'project_manager' }).expect(409);
    const members = await http().get(`/api/v1/organizations/${orgId}/members`).set('Authorization', admin).expect(200);
    const me = members.body.data.find((m: any) => m.userId === participantUserId);
    expect(me.roles).toContain('project_manager');
  });

  it('revoking removes the capability again; both changes audited', async () => {
    await http()
      .delete(`/api/v1/organizations/${orgId}/members/${participantUserId}/roles/project_manager`)
      .set('Authorization', admin)
      .expect(204);

    const after = await policy.can(actor(), 'project.donation.open', { organizationId: orgId });
    expect(after.allow).toBe(false);

    for (let i = 0; i < 30; i++) {
      const granted = await prisma.auditLog.findFirst({
        where: { action: 'role.granted', requestId: { not: 'w1-backfill' } },
      });
      const revoked = await prisma.auditLog.findFirst({ where: { action: 'role.revoked' } });
      if (granted && revoked) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('role change audit rows never appeared');
  });
});
