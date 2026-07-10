import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { accessTokenFor, authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { createProjectViaApi } from './utils/fixtures';

/**
 * W0-E1-S5 — Auth & roles matrix for the seeded accounts.
 *
 * Freezes the CURRENT authorization behavior: global JwtAuthGuard (@Public
 * opt-out) + RolesGuard (@Roles allow-list; routes without @Roles admit any
 * authenticated user). Guards run before pipes, so for mutating routes the
 * expected status encodes both facts: disallowed roles → 403, allowed roles
 * with an empty body → 400 (validation) or 404 (missing resource).
 *
 * Statuses are per identity in the order:
 *   anonymous · participant · financial_officer · employee · administrator
 *
 * Deliberate current-behavior gaps pinned here (see backlog/BACKLOG_BUGS.md):
 *   BUG-6 refresh flow always 401 · BUG-7 participant profiles readable by
 *   any participant · BUG-8 study details unrestricted · BUG-9 dashboard
 *   unrestricted.
 */
describe('Auth & roles matrix (W0-E1-S5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: Record<Identity, string | null>;

  const SEEDED_PROJECT_ID = 1; // created by the seed script

  type Identity = 'anonymous' | 'participant' | 'financial_officer' | 'employee' | 'administrator';
  const IDENTITIES: Identity[] = [
    'anonymous',
    'participant',
    'financial_officer',
    'employee',
    'administrator',
  ];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    tokens = {
      anonymous: null,
      participant: await authHeaderFor(prisma, 'participant'),
      financial_officer: await authHeaderFor(prisma, 'financial_officer'),
      employee: await authHeaderFor(prisma, 'employee'),
      administrator: await authHeaderFor(prisma, 'administrator'),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── The matrix ───────────────────────────────────────────────────────────────

  describe('endpoint access matrix', () => {
    // [method, path, body, [anon, participant, officer, employee, admin]]
    const MATRIX: Array<[string, string, object | undefined, number[]]> = [
      // @Public routes
      ['GET', '/api/v1/languages', undefined, [200, 200, 200, 200, 200]],
      ['GET', '/api/v1/blocks', undefined, [200, 200, 200, 200, 200]],
      ['GET', '/api/v1/projects', undefined, [200, 200, 200, 200, 200]],
      ['GET', `/api/v1/projects/${SEEDED_PROJECT_ID}`, undefined, [200, 200, 200, 200, 200]],
      ['POST', '/api/v1/auth/forgot-password', { email: 'ghost@example.com' }, [200, 200, 200, 200, 200]],

      // Authenticated, no @Roles → any logged-in identity
      ['GET', '/api/v1/auth/me', undefined, [401, 200, 200, 200, 200]],
      ['GET', '/api/v1/donations', undefined, [401, 200, 200, 200, 200]],
      ['GET', '/api/v1/voting/my-votes', undefined, [401, 200, 200, 200, 200]],
      ['GET', '/api/v1/notifications', undefined, [401, 200, 200, 200, 200]],
      // BUG-9 FIXED (pilot consolidation): dashboard is staff-only
      ['GET', '/api/v1/dashboard/stats', undefined, [401, 403, 200, 200, 200]],
      // BUG-8 FIXED (pilot consolidation): study-by-id is staff-only —
      // participants are refused before the handler (drafts/rejection reasons/
      // unpublished sections stay internal; public read = /study/project/:id)
      ['GET', '/api/v1/study/999999', undefined, [401, 403, 404, 404, 404]],

      // Role-restricted reads
      ['GET', '/api/v1/study', undefined, [401, 403, 200, 200, 200]],
      ['GET', '/api/v1/admins', undefined, [401, 403, 403, 403, 200]],
      ['GET', '/api/v1/admins/financial-officers', undefined, [401, 403, 403, 200, 200]],
      ['GET', '/api/v1/participants', undefined, [401, 403, 403, 200, 200]],
      ['GET', '/api/v1/payments/donations', undefined, [401, 200, 403, 200, 200]],
      ['GET', `/api/v1/projects/${SEEDED_PROJECT_ID}/financial/summary`, undefined, [401, 403, 200, 200, 200]],
      ['GET', `/api/v1/projects/${SEEDED_PROJECT_ID}/financial/transactions`, undefined, [401, 403, 200, 403, 200]],
      ['GET', `/api/v1/projects/${SEEDED_PROJECT_ID}/execution/phases`, undefined, [401, 403, 403, 200, 200]],
      ['GET', `/api/v1/projects/${SEEDED_PROJECT_ID}/milestones`, undefined, [401, 403, 403, 200, 200]],
      ['GET', '/api/v1/voting/999999/votes', undefined, [401, 403, 403, 403, 404]],

      // Staff mutations (empty body → 400 validation for allowed roles)
      ['POST', '/api/v1/projects', {}, [401, 403, 403, 400, 400]],
      ['POST', '/api/v1/blocks', {}, [401, 403, 403, 400, 400]],
      ['POST', '/api/v1/study', {}, [401, 403, 403, 400, 400]],
      ['PATCH', '/api/v1/study/999999/status', {}, [401, 403, 403, 400, 400]],
      ['PATCH', '/api/v1/donations/999999/status', {}, [401, 403, 400, 400, 400]],
      ['POST', `/api/v1/projects/${SEEDED_PROJECT_ID}/execution/tasks`, {}, [401, 403, 403, 400, 400]],
      ['POST', `/api/v1/projects/${SEEDED_PROJECT_ID}/milestones`, {}, [401, 403, 403, 400, 400]],
      ['POST', `/api/v1/projects/${SEEDED_PROJECT_ID}/financial/expenses`, {}, [401, 403, 403, 400, 400]],
      ['POST', `/api/v1/projects/${SEEDED_PROJECT_ID}/financial/budgets`, {}, [401, 403, 400, 403, 400]],
      ['POST', `/api/v1/projects/${SEEDED_PROJECT_ID}/financial/transactions`, {}, [401, 403, 400, 403, 400]],

      // Participant-only mutations
      ['POST', '/api/v1/donations', {}, [401, 400, 403, 403, 403]],
      ['POST', '/api/v1/payments/checkout', {}, [401, 400, 403, 403, 403]],

      // Administrator-only actions
      ['POST', '/api/v1/admins', {}, [401, 403, 403, 403, 400]],
      ['POST', '/api/v1/languages', {}, [401, 403, 403, 403, 400]],
      ['DELETE', '/api/v1/projects/999999', undefined, [401, 403, 403, 403, 404]],
      ['DELETE', '/api/v1/study/999999', undefined, [401, 403, 403, 403, 404]],
      ['PATCH', '/api/v1/participants/999999/toggle-active', undefined, [401, 403, 403, 403, 404]],
      ['PATCH', '/api/v1/admins/999999/toggle-active', undefined, [401, 403, 403, 403, 404]],
    ];

    it.each(MATRIX)('%s %s → %p', async (method, path, body, expected) => {
      for (let i = 0; i < IDENTITIES.length; i++) {
        const identity = IDENTITIES[i];
        let req = (http() as any)[method.toLowerCase()](path);
        if (tokens[identity]) req = req.set('Authorization', tokens[identity]);
        if (body !== undefined) req = req.send(body);

        const res = await req;
        if (res.status !== expected[i]) {
          throw new Error(
            `${method} ${path} as ${identity}: expected ${expected[i]}, got ${res.status} ` +
              `(${JSON.stringify(res.body.message ?? '')})`,
          );
        }
      }
    });
  });

  // ─── Authentication flows ─────────────────────────────────────────────────────

  describe('login', () => {
    it.each(Object.entries(SEED_ACCOUNTS))(
      'seeded %s logs in and receives a working access token',
      async (role, creds) => {
        const res = await http().post('/api/v1/auth/login').send(creds).expect(200);
        expect(res.body.data.accessToken).toBeDefined();
        expect(res.body.data.refreshToken).toBeDefined();
        expect(res.body.data.user.password).toBeUndefined(); // sanitized

        const expectedRole = role === 'participant' ? undefined : role;
        if (expectedRole) expect(res.body.data.user.admin.role).toBe(expectedRole);
        else expect(res.body.data.user.referenceType).toBe('participant');

        await http()
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${res.body.data.accessToken}`)
          .expect(200);
      },
    );

    it('rejects a wrong password and an unknown email identically (401)', async () => {
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: SEED_ACCOUNTS.participant.email, password: 'Wrong@12345' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'Wrong@12345' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message); // no user enumeration
    });

    it('rejects deactivated accounts', async () => {
      await prisma.user.update({
        where: { email: SEED_ACCOUNTS.participant.email },
        data: { isActive: false },
      });
      const res = await http()
        .post('/api/v1/auth/login')
        .send(SEED_ACCOUNTS.participant)
        .expect(401);
      expect(res.body.message).toContain('deactivated');

      await prisma.user.update({
        where: { email: SEED_ACCOUNTS.participant.email },
        data: { isActive: true },
      });
    });

    it('registration creates a participant account that can log in', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({
          firstName: 'New',
          lastName: 'Member',
          email: 'new.member@example.com',
          password: 'Newmember@123',
        })
        .expect(201);

      // BUG-10: two token issuances for one user within the same second
      // collide on the unique refresh token (deterministic JWT) → 500.
      // Waiting >1s sidesteps the collision; remove when BUG-10 is fixed.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'new.member@example.com', password: 'Newmember@123' })
        .expect(200);
      expect(login.body.data.user.referenceType).toBe('participant');
    });
  });

  describe('JWT behavior', () => {
    it('rejects missing, malformed and wrongly-signed tokens', async () => {
      await http().get('/api/v1/auth/me').expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);

      const foreign = await new JwtService({ secret: 'some-other-secret' }).signAsync({
        sub: 1,
        email: SEED_ACCOUNTS.administrator.email,
        role: 'administrator',
        referenceType: 'admin',
        referenceId: 1,
      });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${foreign}`).expect(401);
    });

    it('rejects expired tokens', async () => {
      const expired = await new JwtService({ secret: process.env.JWT_SECRET }).signAsync(
        { sub: 1, email: SEED_ACCOUNTS.administrator.email, role: 'administrator', referenceType: 'admin', referenceId: 1 },
        { expiresIn: '-10s' },
      );
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('rejects a valid token once its user is deactivated (DB check in the strategy)', async () => {
      const token = await accessTokenFor(prisma, 'participant');
      await prisma.user.update({
        where: { email: SEED_ACCOUNTS.participant.email },
        data: { isActive: false },
      });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);

      await prisma.user.update({
        where: { email: SEED_ACCOUNTS.participant.email },
        data: { isActive: true },
      });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('rejects tokens whose user no longer exists', async () => {
      const ghost = await new JwtService({ secret: process.env.JWT_SECRET }).signAsync({
        sub: 999999,
        email: 'ghost@example.com',
        role: 'administrator',
        referenceType: 'admin',
        referenceId: 999999,
      });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${ghost}`).expect(401);
    });
  });

  describe('refresh-token flow', () => {
    it('a fresh refresh token rotates into a new working pair (BUG-6 fixed in W1-E5-S1)', async () => {
      const login = await http().post('/api/v1/auth/login').send(SEED_ACCOUNTS.employee).expect(200);
      const oldRefresh = login.body.data.refreshToken;

      const stored = await prisma.refreshToken.findFirst({ where: { token: oldRefresh } });
      expect(stored).toBeTruthy();
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await new Promise((resolve) => setTimeout(resolve, 1100)); // BUG-10 guard (distinct iat)

      const refreshed = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(200);
      expect(refreshed.body.data.accessToken).toBeDefined();
      expect(refreshed.body.data.refreshToken).not.toBe(oldRefresh);

      // Rotation: the used token is revoked, the new pair works
      expect(await prisma.refreshToken.findFirst({ where: { token: oldRefresh } })).toBeNull();
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
        .expect(200);
    });

    it('outdated-version access tokens are rejected so clients re-auth (token versioning)', async () => {
      const { JwtService } = require('@nestjs/jwt');
      const stale = await new JwtService({ secret: process.env.JWT_SECRET }).signAsync({
        sub: 1,
        email: SEED_ACCOUNTS.administrator.email,
        role: 'administrator',
        referenceType: 'admin',
        referenceId: 1,
        // no tokenVersion — pre-W1 shape
      });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`).expect(401);
    });

    it('garbage refresh tokens are rejected', async () => {
      await http().post('/api/v1/auth/refresh').send({ refreshToken: 'garbage' }).expect(401);
    });
  });

  describe('password reset flow', () => {
    const email = SEED_ACCOUNTS.participant.email;

    it('forgot-password creates a reset token for known emails and stays silent for unknown ones', async () => {
      await http().post('/api/v1/auth/forgot-password').send({ email }).expect(200);
      const row = await prisma.passwordResetToken.findFirst({ where: { email } });
      expect(row).toBeTruthy();

      await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);
      const ghost = await prisma.passwordResetToken.findFirst({
        where: { email: 'ghost@example.com' },
      });
      expect(ghost).toBeNull();
    });

    it('reset-password rejects invalid tokens', async () => {
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'Whatever@123' })
        .expect(400);
    });

    it('reset-password changes the password, consumes the token and revokes refresh tokens', async () => {
      const row = await prisma.passwordResetToken.findFirst({ where: { email } });
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token: row!.token, password: 'Reset@12345' })
        .expect(200);

      await http().post('/api/v1/auth/login').send({ email, password: 'Reset@12345' }).expect(200);
      await http().post('/api/v1/auth/login').send(SEED_ACCOUNTS.participant).expect(401);

      // Token is single-use
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token: row!.token, password: 'Another@123' })
        .expect(400);

      // All refresh tokens for the user were revoked at reset time
      const user = await prisma.user.findUnique({ where: { email } });
      const remaining = await prisma.refreshToken.count({
        where: { userId: user!.id, createdAt: { lt: new Date() } },
      });
      expect(remaining).toBeLessThanOrEqual(1); // only the post-reset login's token

      // Restore the seeded password for the rest of the suite
      await prisma.user.update({
        where: { email },
        data: { password: await bcrypt.hash(SEED_ACCOUNTS.participant.password, 12) },
      });
    });
  });

  describe('change-password and logout', () => {
    // Uses the financial officer account: its only other login is early in
    // the suite, so these logins can't hit the BUG-10 same-second collision.
    it('change-password requires the correct current password', async () => {
      const auth = await authHeaderFor(prisma, 'financial_officer');
      await http()
        .patch('/api/v1/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: 'Wrong@12345', newPassword: 'Changed@123' })
        .expect(400);

      await http()
        .patch('/api/v1/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: SEED_ACCOUNTS.financial_officer.password, newPassword: 'Changed@123' })
        .expect(200);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: SEED_ACCOUNTS.financial_officer.email, password: 'Changed@123' })
        .expect(200);

      // Restore
      await http()
        .patch('/api/v1/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: 'Changed@123', newPassword: SEED_ACCOUNTS.financial_officer.password })
        .expect(200);
    });

    it('logout revokes the presented refresh token', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100)); // BUG-10 guard
      const login = await http().post('/api/v1/auth/login').send(SEED_ACCOUNTS.financial_officer).expect(200);
      const { accessToken, refreshToken } = login.body.data;

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      const stored = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
      expect(stored).toBeNull();
    });
  });

  // ─── Ownership & data-exposure gaps (pinned current behavior) ─────────────────

  describe('ownership checks and known gaps', () => {
    it('BUG-7 (current behavior): participants cannot update ANY profile — not even their own', async () => {
      // User.participantId is never populated, so the ownership check in
      // participants.service.update compares against participant.user?.id
      // (always undefined) and 403s every participant, owner included.
      // When BUG-7 is fixed, self-update must become 200 and foreign
      // profiles must stay 403.
      await http()
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Second',
          lastName: 'Member',
          email: 'second.member@example.com',
          password: 'Secondmember@1',
        })
        .expect(201);
      const other = await prisma.participant.findFirst({
        where: { firstName: 'Second', lastName: 'Member' },
      });

      await http()
        .put(`/api/v1/participants/${other!.id}`)
        .set('Authorization', tokens.participant!)
        .send({ firstName: 'Hacked' })
        .expect(403);

      const meUser = await prisma.user.findUnique({
        where: { email: SEED_ACCOUNTS.participant.email },
      });
      await http()
        .put(`/api/v1/participants/${meUser!.referenceId}`)
        .set('Authorization', tokens.participant!)
        .send({ firstName: 'John' })
        .expect(403); // owner too — administrators are the only ones who can update

      await http()
        .put(`/api/v1/participants/${meUser!.referenceId}`)
        .set('Authorization', tokens.administrator!)
        .send({ firstName: 'John' })
        .expect(200);
    });

    it('BUG-11 FIXED (pilot consolidation): participants read only their own profile', async () => {
      const other = await prisma.participant.findFirst({
        where: { firstName: 'Second', lastName: 'Member' },
      });
      // foreign profile reads as nonexistence — no information leak
      await http()
        .get(`/api/v1/participants/${other!.id}`)
        .set('Authorization', tokens.participant!)
        .expect(404);
      // own profile still readable (id from the token's identity — an
      // earlier test renames the seeded participant)
      const ownUser = await prisma.user.findUnique({ where: { email: 'participant@example.com' } });
      const own = await http()
        .get(`/api/v1/participants/${ownUser!.referenceId}`)
        .set('Authorization', tokens.participant!)
        .expect(200);
      expect(own.body.data.id).toBe(ownUser!.referenceId);
      // BUG-7 side effect (still open): the user relation is null because
      // User.participantId is never written — asserted to pin it.
      expect(own.body.data.user).toBeNull();
    });

    it('BUG-8 FIXED (pilot consolidation): participants cannot read unpublished study details by id', async () => {
      const { projectId } = await createProjectViaApi(app, tokens.employee!, 'auth-matrix');
      const study = await http()
        .post('/api/v1/study')
        .set('Authorization', tokens.employee!)
        .send({ projectId, summary: 'Draft — should not be public' })
        .expect(201);

      // staff-only now: drafts, rejection reasons, and unpublished sections
      // never reach participants through the by-id route
      await http()
        .get(`/api/v1/study/${study.body.data.id}`)
        .set('Authorization', tokens.participant!)
        .expect(403);
      // staff still reads it
      const staff = await http()
        .get(`/api/v1/study/${study.body.data.id}`)
        .set('Authorization', tokens.employee!)
        .expect(200);
      expect(staff.body.data.summary).toBe('Draft — should not be public');
    });
  });
});
