import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * W1-E2-S1/S2 — organizations module: platform-internal CRUD, membership
 * management, capability administration; every mutation audited; org-type
 * flags respected.
 */
describe('Organizations module (W1-E2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let participant: string;
  let adminUserId: number;
  let participantUserId: number;

  let orgId: number;

  const http = () => request(app.getHttpServer());

  const auditRow = async (action: string, subjectId: number | string, subjectType = 'organization') => {
    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({
        where: { action, subjectType, subjectId: String(subjectId) },
      });
      if (row) return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    [admin, employee, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'participant'),
    ]);
    adminUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.administrator.email } }))!.id;
    participantUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.participant.email } }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('is platform-internal: only administrators may touch organizations', async () => {
    await http().get('/api/v1/organizations').set('Authorization', employee).expect(403);
    await http().get('/api/v1/organizations').set('Authorization', participant).expect(403);
    await http().post('/api/v1/organizations').set('Authorization', employee).send({}).expect(403);
    await http().get('/api/v1/organizations').expect(401);
  });

  it('creates an ngo organization with default (all-false) capabilities', async () => {
    const res = await http()
      .post('/api/v1/organizations')
      .set('Authorization', admin)
      .send({ type: 'ngo', name: 'HelpingHands', registrationNumber: 'REG-001' })
      .expect(201);

    orgId = res.body.data.id;
    expect(res.body.data.status).toBe('pending_verification');
    expect(res.body.data.capabilities).toEqual({
      canExecuteProjects: false,
      canReceivePublicFunds: false,
      canOpenDonations: false,
      isGovernmentEntity: false,
      requiresBoardOversight: false,
    });

    const audit = await auditRow('organization.created', orgId);
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(adminUserId);
  });

  it('org types beyond ngo|board are blocked behind the type flag', async () => {
    for (const type of ['municipality', 'youth_team', 'initiative']) {
      const res = await http()
        .post('/api/v1/organizations')
        .set('Authorization', admin)
        .send({ type, name: `Flagged ${type}` })
        .expect(400);
      expect(res.body.message).toContain('not enabled');
    }

    // board is enabled by default
    await http()
      .post('/api/v1/organizations')
      .set('Authorization', admin)
      .send({ type: 'board', name: 'Governance Board' })
      .expect(201);

    // enabling the flag opens the type up
    process.env.ORG_TYPES_ENABLED = 'ngo,board,municipality';
    try {
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', admin)
        .send({ type: 'municipality', name: 'Test City' })
        .expect(201);
    } finally {
      delete process.env.ORG_TYPES_ENABLED;
    }
  });

  it('updates an organization (status, name) with an audit entry', async () => {
    const res = await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', admin)
      .send({ status: 'active', name: 'HelpingHands NGO' })
      .expect(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.name).toBe('HelpingHands NGO');

    const audit = await auditRow('organization.updated', orgId);
    expect(audit!.after).toEqual({ changedFields: ['status', 'name'] });
  });

  it('capability changes are audited with before/after snapshots (W1-E2-S2 AC)', async () => {
    const capabilities = {
      canExecuteProjects: true,
      canReceivePublicFunds: true,
      canOpenDonations: true,
      isGovernmentEntity: false,
      requiresBoardOversight: false,
    };
    const res = await http()
      .patch(`/api/v1/organizations/${orgId}/capabilities`)
      .set('Authorization', admin)
      .send(capabilities)
      .expect(200);
    expect(res.body.data.capabilities).toEqual(capabilities);

    const audit = await auditRow('capability.changed', orgId);
    expect(audit).not.toBeNull();
    expect(audit!.before).toMatchObject({ canExecuteProjects: false });
    expect(audit!.after).toEqual(capabilities);
  });

  it('manages memberships: add, list, duplicate-conflict, remove — all audited', async () => {
    const added = await http()
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', admin)
      .send({ userId: participantUserId })
      .expect(201);
    const membershipId = added.body.data.id;
    expect(added.body.data.status).toBe('active');

    await http()
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', admin)
      .send({ userId: participantUserId })
      .expect(409);

    const members = await http()
      .get(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', admin)
      .expect(200);
    expect(members.body.data.map((m: any) => m.userId)).toContain(participantUserId);

    expect(await auditRow('membership.added', membershipId, 'organization_membership')).not.toBeNull();

    await http()
      .delete(`/api/v1/organizations/${orgId}/members/${participantUserId}`)
      .set('Authorization', admin)
      .expect(204);
    expect(await auditRow('membership.removed', membershipId, 'organization_membership')).not.toBeNull();

    const after = await http()
      .get(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', admin)
      .expect(200);
    expect(after.body.data.map((m: any) => m.userId)).not.toContain(participantUserId);
  });

  it('lists and filters organizations', async () => {
    const all = await http().get('/api/v1/organizations?limit=50').set('Authorization', admin).expect(200);
    expect(all.body.data.meta.total).toBeGreaterThanOrEqual(3);

    const boards = await http()
      .get('/api/v1/organizations?type=board')
      .set('Authorization', admin)
      .expect(200);
    expect(boards.body.data.data.every((o: any) => o.type === 'board')).toBe(true);

    const detail = await http().get(`/api/v1/organizations/${orgId}`).set('Authorization', admin).expect(200);
    expect(detail.body.data.name).toBe('HelpingHands NGO');
    await http().get('/api/v1/organizations/999999').set('Authorization', admin).expect(404);
  });
});
