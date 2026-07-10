import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi } from './utils/fixtures';

/**
 * W6 addendum — fund of record: Project.primaryFundId is identity
 * attribution (chosen at creation, like ownerOrganizationId), distinct from
 * FundAllocation's many-to-many financing relationship. Covers: optional by
 * default, fund existence/active validation, the PROJECT_FUND_REQUIRED
 * cutover flag, and the post-Board-approval lock that targets only the fund
 * field (not a blanket freeze).
 */
describe('Fund of record (W6 addendum)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let devFundId: number;
  let frozenFundId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');

    const devFund = await prisma.fund.findFirst({ where: { name: 'Development & Infrastructure' } });
    devFundId = devFund!.id;
    const frozen = await prisma.fund.create({ data: { name: 'W6 Frozen Test Fund', status: 'frozen' } });
    frozenFundId = frozen.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a project with no fund selected — optional by default', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-fund-none');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 10000, category: 'agricultural' })
      .expect(201);
    expect(created.body.data.primaryFundId).toBeNull();
    expect(created.body.data.primaryFund).toBeNull();
  });

  it('creates a project with a fund and returns it in both the create and detail responses', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-fund-selected');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 10000, category: 'agricultural', fundId: devFundId })
      .expect(201);
    expect(created.body.data.primaryFundId).toBe(devFundId);
    expect(created.body.data.primaryFund).toEqual({ id: devFundId, name: 'Development & Infrastructure' });

    const detail = await http().get(`/api/v1/projects/${created.body.data.id}`).expect(200);
    expect(detail.body.data.primaryFund.id).toBe(devFundId);
  });

  it('rejects a nonexistent fund', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-fund-missing');
    const res = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 10000, category: 'agricultural', fundId: 999999 })
      .expect(404);
    expect(res.body.message).toContain('Fund #999999');
  });

  it('rejects a non-active fund', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-fund-frozen');
    const res = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 10000, category: 'agricultural', fundId: frozenFundId })
      .expect(400);
    expect(res.body.message).toContain('frozen');
  });

  it('PROJECT_FUND_REQUIRED=true blocks creation without a fund, allows it with one', async () => {
    process.env.PROJECT_FUND_REQUIRED = 'true';
    try {
      const blockId = await createBlockViaApi(app, admin, 'w6-fund-required-block');
      const blocked = await http()
        .post('/api/v1/projects')
        .set('Authorization', admin)
        .send({ blockId, value: 10000, category: 'agricultural' })
        .expect(400);
      expect(blocked.body.message).toContain('A fund must be selected');

      const blockId2 = await createBlockViaApi(app, admin, 'w6-fund-required-ok');
      await http()
        .post('/api/v1/projects')
        .set('Authorization', admin)
        .send({ blockId: blockId2, value: 10000, category: 'agricultural', fundId: devFundId })
        .expect(201);
    } finally {
      delete process.env.PROJECT_FUND_REQUIRED;
    }
  });

  it('the fund of record stays editable until an approved Board decision exists, then locks — other fields stay editable', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-fund-lock');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 10000, category: 'agricultural', fundId: devFundId })
      .expect(201);
    const projectId = created.body.data.id;
    const otherFund = await prisma.fund.findFirstOrThrow({ where: { name: 'Social Support' } });

    // editable pre-approval
    await http()
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .send({ fundId: otherFund.id })
      .expect(200);

    // This spec targets the fund-of-record lock in isolation — the Board
    // decision is inserted directly rather than walked through the full
    // study/vote/workflow cycle, which is covered by the governance suites.
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@helpinghands.org' } });
    await prisma.boardDecision.create({
      data: {
        subjectType: 'project',
        subjectId: projectId,
        decision: 'approved',
        rationale: 'W6 addendum spec fixture',
        decidedById: adminUser.id,
      },
    });

    const blocked = await http()
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .send({ fundId: devFundId })
      .expect(403);
    expect(blocked.body.message).toContain('locked after Board approval');

    // scoped lock, not a blanket freeze — everything else stays editable
    await http()
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .send({ location: 'Updated location post-approval' })
      .expect(200);
  });
});
