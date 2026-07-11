import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TreasuryService } from '../src/modules/treasury/treasury.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';
import { fromCsv } from '../src/modules/transparency/csv.util';

const DONOR_EMAIL = 'privacy.probe.donor@example.com';
const DONOR_FIRST = 'Confidential';
const DONOR_LAST = 'Donorson';
const BENEFICIARY_SECRET = 'BENEFICIARY-SECRET: widow list — Umm Ahmad, 4 orphans, Al-Karama district';

/**
 * W7 — Reporting & Transparency (permanent suite member):
 *   E1  the read layer matches live ledger/workflow queries, carries "as of",
 *       and refreshes on ledger.posted;
 *   E1-S2/S3  publication policy: conservative defaults, Board-gated changes
 *       flow to public output (audited), never_public is immutable; donor
 *       identity and beneficiary data appear in NO public response, however
 *       hard the endpoints are probed;
 *   E1-S4  the public surface is rate-limited (burst 429s);
 *   E4  fund statement CSV reconciles with W5 balances and round-trips;
 *   E3  Board dashboard and the legacy dashboard agree (one source).
 */
describe('Transparency (W7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let treasury: TreasuryService;
  let board: string;
  let projectId: number;
  let fundId: number;
  let orgId: number;
  let allocationId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    treasury = app.get(TreasuryService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';
    board = await authHeaderFor(prisma, 'administrator');

    // ── fixture: a civic project with money moving through the REAL flows —
    // QR approval and expense approval dual-write the legacy journal, so the
    // W5 reconciliation gate stays exact across suite reseeds.
    ({ projectId } = await createProjectViaApi(app, board, 'w7-fixture', { value: 10000, category: 'agricultural' }));
    const defaultOrg = await prisma.organization.findFirst({ where: { type: 'ngo' } });
    orgId = defaultOrg!.id;
    const actor = { userId: null, referenceType: 'system', requestId: 'w7-spec', ip: null } as never;

    // a donor with a distinctive identity (the privacy probe target)
    await http()
      .post('/api/v1/auth/register')
      .send({ email: DONOR_EMAIL, password: 'Donor@12345', firstName: DONOR_FIRST, lastName: DONOR_LAST })
      .expect(201);
    const donorLogin = await http().post('/api/v1/auth/login').send({ email: DONOR_EMAIL, password: 'Donor@12345' }).expect(200);
    const pledge = await http()
      .post('/api/v1/donations')
      .set('Authorization', `Bearer ${donorLogin.body.data.accessToken}`)
      .send({ projectId, amount: 500 })
      .expect(201);
    await http()
      .patch(`/api/v1/donations/${pledge.body.data.id}/status`)
      .set('Authorization', board)
      .send({ status: 'approved' })
      .expect(200);

    // fund intake + a Board-approved allocation with one disbursed tranche
    const fund = await prisma.fund.findFirst({ where: { name: 'Development & Infrastructure' } });
    fundId = fund!.id;
    const fundAccount = await treasury.fundAccount(fundId);
    const grantor = await treasury.ensureAccount('external', null, 'W7 grantor', 'income');
    await treasury.post(actor, {
      description: 'Grant intake (W7 fixture)',
      referenceType: 'spec_fixture',
      referenceId: 90002,
      event: 'grant.received',
      entries: [
        { accountId: grantor.id, direction: 'debit', amount: 4000 },
        { accountId: fundAccount.id, direction: 'credit', amount: 4000 },
      ],
    });
    const proposal = await http()
      .post(`/api/v1/funds/${fundId}/allocations`)
      .set('Authorization', board)
      .send({ projectId, amount: 1500, note: 'W7 fixture allocation' })
      .expect(201);
    allocationId = proposal.body.data.id;
    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', board)
      .send({ subjectType: 'fund_allocation', subjectId: allocationId, decision: 'approved', rationale: 'W7 fixture.' })
      .expect(201);
    await http().post(`/api/v1/funds/allocations/${allocationId}/approve`).set('Authorization', board).expect(201);
    await http().post(`/api/v1/funds/allocations/${allocationId}/disburse`).set('Authorization', board).send({ amount: 1000 }).expect(201);

    // spend out of the project account through the real expense flow
    const expenseBlockId = await createBlockViaApi(app, board, 'w7-expense');
    const expense = await http()
      .post(`/api/v1/projects/${projectId}/financial/expenses`)
      .set('Authorization', board)
      .send({ blockId: expenseBlockId, amount: 300 })
      .expect(201);
    await http()
      .patch(`/api/v1/projects/${projectId}/financial/expenses/${expense.body.data.id}/status`)
      .set('Authorization', board)
      .send({ status: 'approved' })
      .expect(200);
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  // ─── E1-S1: aggregates match live queries, with freshness ───────────────────

  it('platform stats match direct queries and carry "as of"', async () => {
    const res = await http().get('/api/v1/transparency/stats').expect(200);
    expect(res.headers['cache-control']).toContain('max-age');
    const { asOf, data } = res.body.data;
    expect(new Date(asOf).getTime()).toBeGreaterThan(0);

    const cashAgg = await prisma.projectDonation.aggregate({ where: { status: 'approved' }, _sum: { amount: true } });
    expect(data.intakeByChannel.qr_cash_donations.amount).toBe(Number(cashAgg._sum.amount));
    expect(Object.values(data.projectsByState).reduce((s: number, n) => s + Number(n), 0)).toBe(
      await prisma.workflowInstance.count({ where: { subjectType: 'project' } }),
    );
    expect(data.organizationsByType.ngo).toBeGreaterThanOrEqual(1);
  });

  it('the fund page matches the treasury balance and shows spend by category', async () => {
    const res = await http().get(`/api/v1/transparency/funds/${fundId}`).expect(200);
    const fund = res.body.data.data;
    const account = await treasury.fundAccount(fundId);
    expect(fund.balance).toBe(await treasury.balance(account.id)); // 4000 − 1000
    expect(fund.intake).toBe(4000);
    expect(fund.disbursed).toBe(1000);
    const allocation = fund.allocations.find((a: { id: number }) => a.id === allocationId);
    expect(allocation.amount).toBe(1500);
    expect(allocation.disbursed).toBe(1000);
    expect(fund.spendByCategory.length).toBeGreaterThan(0);
  });

  it('the project page: funding by channel, allocations, and the money trail', async () => {
    const res = await http().get(`/api/v1/transparency/projects/${projectId}`).expect(200);
    const project = res.body.data.data;
    // Donation-table-sourced (not ledger-sourced) — unaffected by W9's fund
    // routing, still the accurate headline attribution regardless of which
    // ledger account the money passed through on its way to the project.
    expect(project.funding.byChannel.qr_cash_donations.amount).toBe(500);

    // W9: this project also has its own auto-created default fund, and the
    // $500 QR donation auto-allocated through it — so `allocations` now has
    // TWO entries (the manual W7 fixture grant, and the auto-allocation).
    // Order isn't guaranteed, so look each up rather than assuming [0].
    expect(project.funding.allocations).toHaveLength(2);
    const manual = project.funding.allocations.find((a: { fund: { id: number } }) => a.fund.id === fundId);
    expect(manual.disbursed).toBe(1000);
    const auto = project.funding.allocations.find((a: { fund: { id: number } }) => a.fund.id !== fundId);
    expect(Number(auto.amount)).toBe(500);
    expect(auto.disbursed).toBe(500);

    // intake → account credit → spend category (the headline chain, at the
    // PROJECT's own ledger account). W9: the auto-allocated donation now
    // reaches the project account via a fund_allocation credit (same as the
    // manual grant's tranche) rather than a direct 'donation'-referenced
    // credit — the project's own ledger account genuinely cannot distinguish
    // "a fund passed this through immediately" from "a fund granted this" by
    // design (both really are fund→project transfers); the headline
    // funding.byChannel above is what stays donation-vs-grant accurate.
    const intakeSources = Object.fromEntries(project.moneyTrail.intake.map((i: { source: string; amount: number }) => [i.source, i.amount]));
    expect(intakeSources.fund_allocations).toBe(1500); // 1000 manual + 500 auto-allocated
    expect(intakeSources.qr_cash_donations).toBeUndefined();
    expect(project.moneyTrail.spend).toEqual([{ category: 'project_expenses', amount: 300 }]);
    const projectAccount = await treasury.projectAccount(projectId);
    expect(project.moneyTrail.balance).toBe(await treasury.balance(projectAccount.id)); // 1200
  });

  it('aggregates refresh when ledger.posted fires (event-driven, not just TTL)', async () => {
    const before = await http().get(`/api/v1/transparency/funds/${fundId}`).expect(200);

    const fundAccount = await treasury.fundAccount(fundId);
    const grantor = await treasury.ensureAccount('external', null, 'W7 grantor', 'income');
    await treasury.post({ userId: null, referenceType: 'system', requestId: 'w7-refresh', ip: null } as never, {
      description: 'Second grant tranche',
      referenceType: 'spec_fixture',
      referenceId: 90004,
      event: 'grant.received',
      entries: [
        { accountId: grantor.id, direction: 'debit', amount: 250 },
        { accountId: fundAccount.id, direction: 'credit', amount: 250 },
      ],
    });
    // ledger.posted is emitted post-commit on the async bus — allow it to land
    await new Promise((r) => setTimeout(r, 200));

    const after = await http().get(`/api/v1/transparency/funds/${fundId}`).expect(200);
    expect(after.body.data.data.balance).toBe(before.body.data.data.balance + 250);
    expect(new Date(after.body.data.asOf).getTime()).toBeGreaterThanOrEqual(new Date(before.body.data.asOf).getTime());
  });

  // ─── E1-S2: publication policy ───────────────────────────────────────────────

  it('policy defaults are conservative and Board changes flow to public output (audited)', async () => {
    const policies = await http().get('/api/v1/transparency-policy').set('Authorization', board).expect(200);
    const byClass = Object.fromEntries(policies.body.data.map((p: { fieldClass: string; visibility: string }) => [p.fieldClass, p.visibility]));
    expect(byClass['donor.identity']).toBe('workspace_only');
    expect(byClass['beneficiary.data']).toBe('never_public');
    expect(byClass['fund.allocations']).toBe('public');

    // employee (no board_chair grant) cannot change policy
    const employee = await authHeaderFor(prisma, 'employee');
    await http()
      .patch('/api/v1/transparency-policy/fund.allocations')
      .set('Authorization', employee)
      .send({ visibility: 'workspace_only' })
      .expect(403);

    // Board closes fund.allocations → the public fund page drops the section
    await http()
      .patch('/api/v1/transparency-policy/fund.allocations')
      .set('Authorization', board)
      .send({ visibility: 'workspace_only' })
      .expect(200);
    const closed = await http().get(`/api/v1/transparency/funds/${fundId}`).expect(200);
    expect(closed.body.data.data.allocations).toBeUndefined();
    expect(closed.body.data.data.spendByCategory).toBeUndefined();
    expect(closed.body.data.data.balance).toBeDefined(); // totals stay public

    // audited
    let audit: { id: number } | null = null;
    for (let i = 0; i < 10 && !audit; i++) {
      audit = await prisma.auditLog.findFirst({ where: { action: 'publication_policy.changed' }, orderBy: { id: 'desc' } });
      if (!audit) await new Promise((r) => setTimeout(r, 100));
    }
    expect(audit).not.toBeNull();

    // reopen
    await http()
      .patch('/api/v1/transparency-policy/fund.allocations')
      .set('Authorization', board)
      .send({ visibility: 'public' })
      .expect(200);
    const reopened = await http().get(`/api/v1/transparency/funds/${fundId}`).expect(200);
    expect(reopened.body.data.data.allocations).toBeDefined();
  });

  it('the never_public class is immutable — the Board cannot open beneficiary data', async () => {
    const res = await http()
      .patch('/api/v1/transparency-policy/beneficiary.data')
      .set('Authorization', board)
      .send({ visibility: 'public' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('hard-excluded');
  });

  // ─── E1-S3: privacy exclusion (permanent) ───────────────────────────────────

  it('donor identity appears in NO public response, however hard the endpoints are probed', async () => {
    const probes = [
      `/api/v1/transparency/projects/${projectId}`,
      `/api/v1/transparency/projects/${projectId}?include=participant&select=email,firstName`,
      `/api/v1/transparency/funds/${fundId}?expand=donors`,
      '/api/v1/transparency/stats',
      `/api/v1/transparency/organizations/${orgId}`,
      '/api/v1/transparency/organizations',
      '/api/v1/transparency/decisions?limit=200',
      `/api/v1/transparency/exports/funds/${fundId}/statement.csv`,
    ];
    for (const url of probes) {
      const res = await http().get(url);
      expect([200, 403]).toContain(res.status);
      const body = typeof res.body === 'object' && Object.keys(res.body).length > 0 ? JSON.stringify(res.body) : res.text;
      expect(body).not.toContain(DONOR_EMAIL);
      expect(body).not.toContain(DONOR_LAST);
      expect(body).not.toContain(DONOR_FIRST);
    }
  });

  it('beneficiary data (social_support) is redacted from the public study endpoint at query level', async () => {
    // a social-support project whose study carries personal beneficiary data
    const blockId = await createBlockViaApi(app, board, 'w7-widows');
    const socialProject = await http()
      .post('/api/v1/projects')
      .set('Authorization', board)
      .send({ blockId, value: 5000, categoryKey: 'widows' })
      .expect(201);
    const socialId = socialProject.body.data.id;
    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', board)
      .send({ projectId: socialId, summary: 'Support programme' })
      .expect(201);
    await prisma.studySection.updateMany({
      where: { studyId: study.body.data.id },
      data: { content: BENEFICIARY_SECRET },
    });
    await prisma.projectStudy.update({ where: { id: study.body.data.id }, data: { status: 'published', publishedAt: new Date() } });

    const publicStudy = await http().get(`/api/v1/study/project/${socialId}`).expect(200);
    expect(publicStudy.body.data.beneficiaryDataWithheld).toBe(true);
    expect(JSON.stringify(publicStudy.body)).not.toContain('BENEFICIARY-SECRET');
    expect(publicStudy.body.data.sections.every((s: { content: string | null }) => s.content === null)).toBe(true);

    // …and the transparency project page never carries section content at all
    const transparent = await http().get(`/api/v1/transparency/projects/${socialId}`).expect(200);
    expect(JSON.stringify(transparent.body)).not.toContain('BENEFICIARY-SECRET');

    // a non-social project still serves its published study content
    const agri = await prisma.projectStudy.findFirst({
      where: { project: { categoryNode: { key: 'agricultural' } }, status: 'published' },
    });
    if (agri) {
      const open = await http().get(`/api/v1/study/project/${(await prisma.projectStudy.findUnique({ where: { id: agri.id } }))!.projectId}`);
      expect(open.body.data?.beneficiaryDataWithheld).toBeUndefined();
    }
  });

  // ─── E1-S4: rate limiting ────────────────────────────────────────────────────

  it('the public surface rate-limits bursts (429 under hammering)', async () => {
    // sequential fast-fire: cached responses answer in ~2ms, so 25 requests
    // land inside the 1s burst window; retry rounds absorb slow CI moments
    const statuses: number[] = [];
    for (let round = 0; round < 3 && !statuses.includes(429); round++) {
      for (let i = 0; i < 25; i++) {
        statuses.push((await http().get('/api/v1/transparency/stats')).status);
      }
    }
    expect(statuses).toContain(429);
    expect(statuses).toContain(200);
  });

  // ─── E4: exports ─────────────────────────────────────────────────────────────

  it('the fund statement CSV reconciles with the W5 balance and round-trips', async () => {
    const res = await http().get(`/api/v1/transparency/exports/funds/${fundId}/statement.csv`).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const rows = fromCsv(res.text);
    expect(rows[0]).toEqual(['date', 'description', 'direction', 'amount', 'running_balance']);
    const lastBalance = Number(rows[rows.length - 1][4]);
    const account = await treasury.fundAccount(fundId);
    expect(lastBalance).toBe(await treasury.balance(account.id));

    // round-trip: quoted fields (descriptions can carry commas) survive intact
    const dataRows = rows.slice(1);
    expect(dataRows.length).toBeGreaterThanOrEqual(3);
    expect(dataRows.every((r) => r.length === 5)).toBe(true);
  });

  it('workspace exports: project statement (authed) and org summary reconcile', async () => {
    const projectCsv = await http()
      .get(`/api/v1/transparency/exports/projects/${projectId}/statement.csv`)
      .set('Authorization', board)
      .expect(200);
    const projectRows = fromCsv(projectCsv.text);
    const projectAccount = await treasury.projectAccount(projectId);
    expect(Number(projectRows[projectRows.length - 1][4])).toBe(await treasury.balance(projectAccount.id));

    // anonymous callers cannot pull workspace detail
    await http().get(`/api/v1/transparency/exports/projects/${projectId}/statement.csv`).expect(401);

    const orgCsv = await http()
      .get(`/api/v1/transparency/exports/organizations/${orgId}/summary.csv`)
      .set('Authorization', board)
      .expect(200);
    const orgRows = fromCsv(orgCsv.text);
    expect(orgRows[0][0]).toBe('project_id');
    expect(orgRows.length - 1).toBe(await prisma.project.count({ where: { ownerOrganizationId: orgId, deletedAt: null } }));
  });

  // ─── E3: dashboards agree with the read layer (one source) ──────────────────

  it('Board dashboard and legacy dashboard agree on the headline number', async () => {
    const boardDash = await http().get('/api/v1/dashboards/board').set('Authorization', board).expect(200);
    const legacy = await http().get('/api/v1/dashboard/stats').set('Authorization', board).expect(200);
    expect(legacy.body.data.totalCollected).toBe(
      boardDash.body.data.platform.intakeByChannel.qr_cash_donations.amount,
    );
    expect(boardDash.body.data.decisionThroughput.last30Days).toBeGreaterThanOrEqual(1);
    expect(boardDash.body.data.platform.funds.length).toBeGreaterThanOrEqual(3);
  });

  it('fund trends serve monthly intake/outflow from the ledger', async () => {
    const res = await http().get(`/api/v1/dashboards/funds/${fundId}/trends`).set('Authorization', board).expect(200);
    const months = res.body.data.data;
    expect(months.length).toBeGreaterThanOrEqual(1);
    const total = months.reduce((s: number, m: { intake: number }) => s + m.intake, 0);
    expect(total).toBe(4250); // 4000 + 250 refresh tranche
  });
});
