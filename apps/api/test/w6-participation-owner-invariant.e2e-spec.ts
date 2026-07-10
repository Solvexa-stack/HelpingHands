import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W6 addendum — at most one active "owner" ProjectParticipation per project.
 * Project.ownerOrganizationId stays the structural owner regardless; this
 * guards the parallel accountability record so a joint project can never
 * silently end up with two (or an ambiguous number of) owners.
 */
describe('Participation owner invariant (W6 addendum)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let projectId: number;
  let orgAId: number;
  let orgBId: number;
  let orgCId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    ({ projectId } = await createProjectViaApi(app, admin, 'w6-owner-invariant'));
    const [orgA, orgB, orgC] = await Promise.all([
      prisma.organization.create({ data: { type: 'ngo', name: 'W6 Owner Invariant Org A', status: 'active' } }),
      prisma.organization.create({ data: { type: 'ngo', name: 'W6 Owner Invariant Org B', status: 'active' } }),
      prisma.organization.create({ data: { type: 'ngo', name: 'W6 Owner Invariant Org C', status: 'active' } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgCId = orgC.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('accepts the first owner participation', async () => {
    await http()
      .post(`/api/v1/projects/${projectId}/participations`)
      .set('Authorization', admin)
      .send({ organizationId: orgAId, role: 'owner' })
      .expect(201);
  });

  it('rejects a second active owner participation', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/participations`)
      .set('Authorization', admin)
      .send({ organizationId: orgBId, role: 'owner' })
      .expect(409);
    expect(res.body.message).toContain('already has an active owner participation');
  });

  it('a non-owner role for another org is unaffected by the cap', async () => {
    await http()
      .post(`/api/v1/projects/${projectId}/participations`)
      .set('Authorization', admin)
      .send({ organizationId: orgBId, role: 'executing_agency' })
      .expect(201);
  });

  it('once the owner participation ends, a new one may be added', async () => {
    const list = await http()
      .get(`/api/v1/projects/${projectId}/participations`)
      .set('Authorization', admin)
      .expect(200);
    const ownerRow = list.body.data.find((p: { role: string }) => p.role === 'owner');
    expect(ownerRow).toBeDefined();

    await http()
      .post(`/api/v1/projects/${projectId}/participations/${ownerRow.id}/end`)
      .set('Authorization', admin)
      .expect(201);

    await http()
      .post(`/api/v1/projects/${projectId}/participations`)
      .set('Authorization', admin)
      .send({ organizationId: orgCId, role: 'owner' })
      .expect(201);
  });
});
