import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { authHeaderFor, SEED_ACCOUNTS, SeededRole } from './utils/auth';

describe('E2E harness smoke test (W0-E1-S1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('application pipeline', () => {
    it('serves public routes under the /api/v1 prefix with the response envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/languages').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data.map((l: any) => l.code).sort()).toEqual(['ar', 'en', 'fr']);
    });

    it('validates request bodies (ValidationPipe with whitelist + forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'x', unexpected: 'field' })
        .expect(400);
    });
  });

  describe('seeded accounts', () => {
    it('logs in the seeded administrator', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(SEED_ACCOUNTS.administrator)
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(SEED_ACCOUNTS.administrator.email);
    });

    it.each(Object.keys(SEED_ACCOUNTS) as SeededRole[])(
      'issues a working factory token for the seeded %s',
      async (role) => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', await authHeaderFor(prisma, role))
          .expect(200);

        expect(res.body.data.email).toBe(SEED_ACCOUNTS[role].email);
      },
    );

    it('rejects unauthenticated access to protected routes', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });
  });

  describe('database isolation', () => {
    it('runs against the dedicated test database', () => {
      expect(process.env.DATABASE_URL).toContain('helping_hands_test');
    });

    it('leaves dirty data behind for the next suite to prove reset works', async () => {
      // seed-state.e2e-spec.ts asserts this mutation is gone after its own reset.
      await prisma.language.update({
        where: { code: 'en' },
        data: { name: 'DIRTY — should never survive a reset' },
      });
      await prisma.user.update({
        where: { email: SEED_ACCOUNTS.participant.email },
        data: { isActive: false },
      });
    });
  });
});
