import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * W2-E6 — manual activation flow: a created org starts pending_verification;
 * platform-admin activation stamps verifiedAt/verifiedBy; suspension keeps
 * the stamp; non-admins cannot touch the lifecycle.
 */
describe('Organization activation lifecycle (W2-E6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let orgId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');
  });

  afterAll(async () => {
    await app.close();
  });

  it('a new organization starts pending_verification, unverified', async () => {
    const res = await http()
      .post('/api/v1/organizations')
      .set('Authorization', admin)
      .send({ type: 'ngo', name: 'Activation Test NGO' })
      .expect(201);
    orgId = res.body.data.id;
    expect(res.body.data.status).toBe('pending_verification');
    expect(res.body.data.verifiedAt).toBeNull();
    expect(res.body.data.verifiedBy).toBeNull();
  });

  it('activation stamps verifiedAt/verifiedBy with the acting admin', async () => {
    const adminUser = await prisma.user.findUnique({
      where: { email: SEED_ACCOUNTS.administrator.email },
    });

    const res = await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', admin)
      .send({ status: 'active' })
      .expect(200);

    expect(res.body.data.status).toBe('active');
    expect(res.body.data.verifiedAt).not.toBeNull();
    expect(res.body.data.verifiedBy).toBe(adminUser!.id);
  });

  it('a non-status update does not re-stamp verification', async () => {
    const before = await prisma.organization.findUnique({ where: { id: orgId } });
    const res = await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', admin)
      .send({ name: 'Activation Test NGO (renamed)' })
      .expect(200);
    expect(new Date(res.body.data.verifiedAt).getTime()).toBe(before!.verifiedAt!.getTime());
  });

  it('suspension keeps the verification stamp; reactivation re-stamps', async () => {
    const suspended = await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', admin)
      .send({ status: 'suspended' })
      .expect(200);
    expect(suspended.body.data.status).toBe('suspended');
    expect(suspended.body.data.verifiedAt).not.toBeNull();

    const reactivated = await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', admin)
      .send({ status: 'active' })
      .expect(200);
    expect(reactivated.body.data.status).toBe('active');
    expect(reactivated.body.data.verifiedAt).not.toBeNull();
  });

  it('non-administrators cannot change the lifecycle', async () => {
    const employee = await authHeaderFor(prisma, 'employee');
    await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', employee)
      .send({ status: 'suspended' })
      .expect(403);
  });
});
