import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { SEED_ACCOUNTS } from './utils/auth';

/**
 * harness.e2e-spec.ts deliberately leaves dirty data behind. Suites run
 * serially (maxWorkers: 1) and each resets in beforeAll, so whichever order
 * jest picks, this suite must observe pristine seed state — and it also
 * proves the dirty → reset → pristine cycle deterministically in-test.
 */
describe('Database reset between suites (W0-E1-S1)', () => {
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

  it('restores mutated rows to their seeded values', async () => {
    const english = await prisma.language.findUnique({ where: { code: 'en' } });
    expect(english?.name).toBe('English');
  });

  it('restores the four seeded accounts, all active and able to authenticate', async () => {
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(4);
    expect(users.every((u) => u.isActive)).toBe(true);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(SEED_ACCOUNTS.participant)
      .expect(200);
    expect(res.body.data.user.email).toBe(SEED_ACCOUNTS.participant.email);
  });

  it('returns dirty data to pristine seed state after resetDatabase()', async () => {
    await prisma.language.update({
      where: { code: 'fr' },
      data: { name: 'DIRTY' },
    });
    await prisma.refreshToken.deleteMany();

    await resetDatabase(prisma);

    const french = await prisma.language.findUnique({ where: { code: 'fr' } });
    expect(french?.name).toBe('Français');
    expect(await prisma.user.count()).toBe(4);
  });
});
