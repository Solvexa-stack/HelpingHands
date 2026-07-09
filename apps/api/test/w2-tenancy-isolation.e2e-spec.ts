import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';

/**
 * W2 isolation — the tenant wall, end to end. Two orgs (A, B) each own a
 * project + donation + study + expense; each org admin sees exactly their own
 * data on every list, cannot address the other org's ids (reads AND writes →
 * 404, no existence leak), creation ownership follows the actor's active
 * workspace, and the platform administrator (Board bypass, audited) sees all.
 */
describe('Tenant isolation A/B (W2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformAdmin: string;

  interface Tenant {
    orgId: number;
    auth: string;
    projectId: number;
    donationId: number;
    studyId: number;
    expenseId: number;
    participantAuth: string;
    participantId: number;
  }
  let A: Tenant;
  let B: Tenant;

  const http = () => request(app.getHttpServer());

  /** Cross-org access must be denied without leaking existence: 403 (policy guard) or 404 (tenancy). */
  const expectDenied = async (req: request.Test) => {
    const res = await req;
    expect([403, 404]).toContain(res.status);
    expect(res.body.data ?? null).toBeNull();
  };

  async function onboardOrg(name: string, slug: string): Promise<Pick<Tenant, 'orgId' | 'auth'>> {
    const org = await http()
      .post('/api/v1/organizations')
      .set('Authorization', platformAdmin)
      .send({ type: 'ngo', name })
      .expect(201);
    const orgId = org.body.data.id;
    await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', platformAdmin)
      .send({ status: 'active' })
      .expect(200);

    const email = `${slug}.admin@example.com`;
    await http()
      .post(`/api/v1/organizations/${orgId}/invite-admin`)
      .set('Authorization', platformAdmin)
      .send({ email, firstName: slug, lastName: 'Admin' })
      .expect(201);
    const reset = await prisma.passwordResetToken.findFirst({ where: { email } });
    await http().post('/api/v1/auth/reset-password').send({ token: reset!.token, password: 'Tenant@12345' }).expect(200);
    const login = await http().post('/api/v1/auth/login').send({ email, password: 'Tenant@12345' }).expect(200);
    return { orgId, auth: `Bearer ${login.body.data.accessToken}` };
  }

  async function registerParticipant(slug: string): Promise<{ auth: string; participantId: number }> {
    const email = `${slug}.donor@example.com`;
    await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Donor@12345', firstName: slug, lastName: 'Donor' })
      .expect(201);
    const login = await http().post('/api/v1/auth/login').send({ email, password: 'Donor@12345' });
    if (login.status !== 200) console.error('donor login failed:', login.status, JSON.stringify(login.body));
    expect(login.status).toBe(200);
    return { auth: `Bearer ${login.body.data.accessToken}`, participantId: login.body.data.user.referenceId };
  }

  async function createTenantData(slug: string, t: Pick<Tenant, 'orgId' | 'auth'>): Promise<Tenant> {
    const block = await http()
      .post('/api/v1/blocks')
      .set('Authorization', t.auth)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: `${slug} project`, slug: `${slug}-project`, brief: 'b', description: 'd' }],
      })
      .expect(201);
    const project = await http()
      .post('/api/v1/projects')
      .set('Authorization', t.auth)
      .send({ blockId: block.body.data.id, value: 1000, category: 'agricultural' })
      .expect(201);
    const projectId = project.body.data.id;

    const donor = await registerParticipant(slug);
    const donation = await http()
      .post('/api/v1/donations')
      .set('Authorization', donor.auth)
      .send({ projectId, amount: 100 })
      .expect(201);

    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', t.auth)
      .send({ projectId })
      .expect(201);

    const expenseBlock = await http()
      .post('/api/v1/blocks')
      .set('Authorization', t.auth)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: `${slug} expense`, slug: `${slug}-expense`, brief: 'b', description: 'd' }],
      })
      .expect(201);
    const expense = await http()
      .post(`/api/v1/projects/${projectId}/financial/expenses`)
      .set('Authorization', t.auth)
      .send({ blockId: expenseBlock.body.data.id, amount: 50 })
      .expect(201);

    return {
      ...t,
      projectId,
      donationId: donation.body.data.id,
      studyId: study.body.data.id,
      expenseId: expense.body.data.id,
      participantAuth: donor.auth,
      participantId: donor.participantId,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    platformAdmin = await authHeaderFor(prisma, 'administrator');

    A = await createTenantData('alpha', await onboardOrg('Org Alpha', 'alpha'));
    B = await createTenantData('beta', await onboardOrg('Org Beta', 'beta'));
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  it('creation ownership follows the actor workspace, never a default or the body', async () => {
    const [pa, pb] = await Promise.all([
      prisma.project.findUnique({ where: { id: A.projectId } }),
      prisma.project.findUnique({ where: { id: B.projectId } }),
    ]);
    expect(pa!.ownerOrganizationId).toBe(A.orgId);
    expect(pb!.ownerOrganizationId).toBe(B.orgId);
  });

  describe('Org A admin', () => {
    it('sees only A data on every list', async () => {
      const projects = await http().get('/api/v1/projects').set('Authorization', A.auth).expect(200);
      expect(projects.body.data.data.map((p: any) => p.id)).toEqual([A.projectId]);

      const donations = await http().get('/api/v1/donations').set('Authorization', A.auth).expect(200);
      expect(donations.body.data.data.map((d: any) => d.id)).toEqual([A.donationId]);

      const studies = await http().get('/api/v1/study').set('Authorization', A.auth).expect(200);
      expect(studies.body.data.data.map((s: any) => s.id)).toEqual([A.studyId]);

      const participants = await http().get('/api/v1/participants').set('Authorization', A.auth).expect(200);
      const ids = participants.body.data.data.map((p: any) => p.id);
      expect(ids).toContain(A.participantId);
      expect(ids).not.toContain(B.participantId);
    });

    it('gets own-workspace dashboard numbers, not platform-wide statistics', async () => {
      const stats = await http().get('/api/v1/dashboard/stats').set('Authorization', A.auth).expect(200);
      expect(stats.body.data.totalProjects).toBe(1);
      expect(stats.body.data.totalDonations).toBe(1);
      expect(stats.body.data.totalParticipants).toBeUndefined(); // platform-only tile
    });

    it('cannot read B resources by id — they read as nonexistent', async () => {
      // Entity reads: tenancy answers 404 (no existence leak)
      await http().get(`/api/v1/projects/${B.projectId}`).set('Authorization', A.auth).expect(404);
      await http().get(`/api/v1/donations/${B.donationId}`).set('Authorization', A.auth).expect(404);
      await http().get(`/api/v1/study/${B.studyId}`).set('Authorization', A.auth).expect(404);
      await http().get(`/api/v1/participants/${B.participantId}`).set('Authorization', A.auth).expect(404);
      // Project-subtree routes: the policy scope-chain denies at the guard
      // (403) before tenancy's 404 — an earlier denial (see w2-pilot spec)
      await expectDenied(http().get(`/api/v1/projects/${B.projectId}/financial/expenses`).set('Authorization', A.auth));
      await expectDenied(http().get(`/api/v1/projects/${B.projectId}/execution/phases`).set('Authorization', A.auth));
      await expectDenied(http().get(`/api/v1/projects/${B.projectId}/milestones`).set('Authorization', A.auth));
      await expectDenied(http().get(`/api/v1/reports/projects/${B.projectId}/pdf/summary`).set('Authorization', A.auth));
    });

    it('cannot write to B resources either', async () => {
      await expectDenied(http().put(`/api/v1/projects/${B.projectId}`).set('Authorization', A.auth).send({ location: 'moved' }));
      await expectDenied(
        http().patch(`/api/v1/donations/${B.donationId}/status`).set('Authorization', A.auth).send({ status: 'approved' }),
      );
      await expectDenied(
        http().patch(`/api/v1/study/${B.studyId}/status`).set('Authorization', A.auth).send({ status: 'in_review' }),
      );
      await expectDenied(
        http().post(`/api/v1/projects/${B.projectId}/financial/expenses`).set('Authorization', A.auth).send({ blockId: 1, amount: 1 }),
      );
      // and the wall held: B's project is unchanged
      const untouched = await prisma.project.findUnique({ where: { id: B.projectId } });
      expect(untouched!.location).not.toBe('moved');
    });
  });

  describe('Org B admin (symmetry)', () => {
    it('sees only B data and cannot address A ids', async () => {
      const projects = await http().get('/api/v1/projects').set('Authorization', B.auth).expect(200);
      expect(projects.body.data.data.map((p: any) => p.id)).toEqual([B.projectId]);

      const donations = await http().get('/api/v1/donations').set('Authorization', B.auth).expect(200);
      expect(donations.body.data.data.map((d: any) => d.id)).toEqual([B.donationId]);

      const studies = await http().get('/api/v1/study').set('Authorization', B.auth).expect(200);
      expect(studies.body.data.data.map((s: any) => s.id)).toEqual([B.studyId]);

      await http().get(`/api/v1/projects/${A.projectId}`).set('Authorization', B.auth).expect(404);
      await http().get(`/api/v1/donations/${A.donationId}`).set('Authorization', B.auth).expect(404);
      await http().get(`/api/v1/study/${A.studyId}`).set('Authorization', B.auth).expect(404);
      await http().get(`/api/v1/participants/${A.participantId}`).set('Authorization', B.auth).expect(404);
    });
  });

  describe('Platform administrator (Board bypass, audited)', () => {
    it('sees both tenants everywhere', async () => {
      const projects = await http().get('/api/v1/projects?limit=100').set('Authorization', platformAdmin).expect(200);
      const projectIds = projects.body.data.data.map((p: any) => p.id);
      expect(projectIds).toEqual(expect.arrayContaining([A.projectId, B.projectId]));

      await http().get(`/api/v1/projects/${A.projectId}`).set('Authorization', platformAdmin).expect(200);
      await http().get(`/api/v1/projects/${B.projectId}`).set('Authorization', platformAdmin).expect(200);

      const donations = await http().get('/api/v1/donations?limit=100').set('Authorization', platformAdmin).expect(200);
      expect(donations.body.data.data.map((d: any) => d.id)).toEqual(
        expect.arrayContaining([A.donationId, B.donationId]),
      );

      const studies = await http().get('/api/v1/study?limit=100').set('Authorization', platformAdmin).expect(200);
      expect(studies.body.data.data.map((s: any) => s.id)).toEqual(expect.arrayContaining([A.studyId, B.studyId]));

      const stats = await http().get('/api/v1/dashboard/stats').set('Authorization', platformAdmin).expect(200);
      expect(stats.body.data.totalProjects).toBeGreaterThanOrEqual(2);

      await http().get(`/api/v1/reports/projects/${B.projectId}/pdf/summary`).set('Authorization', platformAdmin).expect(200);
    });
  });
});
