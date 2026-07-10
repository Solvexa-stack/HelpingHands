import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TreasuryService } from '../src/modules/treasury/treasury.service';
import { WorkflowParityService } from '../src/modules/workflow/workflow-parity.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

const PILOT_EMAIL = 'mayor@alkarama.example.gov';
const DAY = 86_400_000;

/**
 * W6 — Municipal Integration, end to end (the wave's DoD walk as a permanent
 * suite member):
 *   E3  registration (flag-gated allowlist) → documents → Board decision →
 *       verified → active with municipal capabilities;
 *   E4  a municipal infrastructure project runs project-lifecycle v2 with the
 *       board_review station; emergency-relief runs the Board fast track;
 *   E1  FundingAgreement signed → allocation under it → overdue reports BLOCK
 *       disbursement → reports submitted/accepted (incl. the returned-with-
 *       comments path) → money moves → reconcile → close;
 *   E5  joint project: NGO owner + municipality executing agency, a municipal
 *       engineer works via a project-scope grant, and the tenancy leak rule
 *       still holds (that one project, nothing else).
 */
describe('Municipal integration (W6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let treasury: TreasuryService;
  let board: string; // platform admin (board_chair grant)
  let mayor: string; // municipality org_admin
  let engineer: { userId: number; auth: string };

  let municipalityId: number;
  let documentsBlockId: number;
  let municipalProjectId: number;
  let studyId: number;
  let fundId: number;
  let agreementId: number;
  let allocationId: number;
  let jointProjectId: number;
  let emergencyProjectId: number;

  const http = () => request(app.getHttpServer());
  const login = async (email: string, password: string) => {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return `Bearer ${res.body.data.accessToken}`;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    treasury = app.get(TreasuryService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';
    process.env.ORG_SELF_REGISTRATION = 'allowlist';
    process.env.ORG_REGISTRATION_ALLOWLIST = PILOT_EMAIL;
    board = await authHeaderFor(prisma, 'administrator');
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    delete process.env.ORG_SELF_REGISTRATION;
    delete process.env.ORG_REGISTRATION_ALLOWLIST;
    await app.close();
  });

  // ─── E3 — onboarding ──────────────────────────────────────────────────────────

  it('registration is flag-gated and allowlisted (pilot-first rule)', async () => {
    const payload = {
      type: 'municipality',
      name: 'Municipality of Al-Karama',
      registrationNumber: 'GOV-2026-0117',
      adminEmail: PILOT_EMAIL,
      adminFirstName: 'Amina',
      adminLastName: 'Haddad',
      adminPassword: 'Mayor@12345',
    };

    process.env.ORG_SELF_REGISTRATION = 'off';
    await http().post('/api/v1/organizations/register').send(payload).expect(403);
    process.env.ORG_SELF_REGISTRATION = 'allowlist';

    await http()
      .post('/api/v1/organizations/register')
      .send({ ...payload, adminEmail: 'not-on-the-list@example.com' })
      .expect(403);

    const res = await http().post('/api/v1/organizations/register').send(payload).expect(201);
    municipalityId = res.body.data.organizationId;
    documentsBlockId = res.body.data.documentsBlockId;

    const org = await prisma.organization.findUnique({ where: { id: municipalityId } });
    expect(org!.status).toBe('pending_verification');
    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'organization', subjectId: municipalityId } },
    });
    expect(instance!.currentStateKey).toBe('submitted');

    mayor = await login(PILOT_EMAIL, 'Mayor@12345');
  });

  it('the Board queue lists the pending registration', async () => {
    const queue = await http().get('/api/v1/governance/verification-queue').set('Authorization', board).expect(200);
    const item = queue.body.data.find((i: { organizationId: number }) => i.organizationId === municipalityId);
    expect(item).toBeDefined();
    expect(item.workflowState).toBe('submitted');
    expect(item.documentsOnFile).toBe(0);
  });

  it('verification needs documents AND a Board decision — in that order of denial', async () => {
    await http().post(`/api/v1/organizations/${municipalityId}/verification/begin-review`).set('Authorization', board).expect(201);

    // no documents on file → the documents_present guard blocks
    const noDocs = await http().post(`/api/v1/organizations/${municipalityId}/verification/verify`).set('Authorization', board);
    expect(noDocs.status).toBe(403);
    expect(noDocs.body.message).toContain('documents_present');

    // the mayor uploads the official registration papers (existing File model)
    await http()
      .post('/api/v1/files/upload')
      .set('Authorization', mayor)
      .field('referenceId', String(documentsBlockId))
      .field('referenceType', 'organization')
      .field('fileType', 'pdf')
      .field('description', 'Official municipal registration decree')
      .attach('file', Buffer.from('%PDF-1.4 w6 pilot registration decree'), 'registration-decree.pdf')
      .expect(201);

    // documents on file, but still no Board decision
    const noDecision = await http().post(`/api/v1/organizations/${municipalityId}/verification/verify`).set('Authorization', board);
    expect(noDecision.status).toBe(403);
    expect(noDecision.body.message).toContain('board_decision:approved-missing');

    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', board)
      .send({
        subjectType: 'organization',
        subjectId: municipalityId,
        decision: 'approved',
        rationale: 'Registration decree verified against the official gazette.',
      })
      .expect(201);

    await http().post(`/api/v1/organizations/${municipalityId}/verification/verify`).set('Authorization', board).expect(201);
    const activated = await http()
      .post(`/api/v1/organizations/${municipalityId}/verification/activate`)
      .set('Authorization', board)
      .expect(201);

    expect(activated.body.data.organization.status).toBe('active');
    expect(activated.body.data.workflowState).toBe('active');
    const capabilities = activated.body.data.organization.capabilities;
    expect(capabilities.isGovernmentEntity).toBe(true);
    expect(capabilities.requiresBoardOversight).toBe(true);
    expect(capabilities.canExecuteProjects).toBe(true);
    expect(capabilities.canOpenDonations).toBe(false); // municipal money comes via agreements
  });

  // ─── E4 — project-lifecycle v2 with board_review ─────────────────────────────

  it('a new municipal project starts on v2; existing projects stay pinned to v1', async () => {
    const blockId = await createBlockViaApi(app, mayor, 'w6-municipal-water');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', mayor)
      .send({ blockId, value: 40000, categoryKey: 'water', location: 'Al-Karama district' })
      .expect(201);
    municipalProjectId = created.body.data.id;

    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: municipalProjectId } },
      include: { definition: true },
    });
    expect(instance!.definition.key).toBe('project-lifecycle');
    expect(instance!.definition.version).toBe(2);

    // the seeded pre-W6 project keeps its v1 pin
    const legacy = await prisma.workflowInstance.findFirst({
      where: { subjectType: 'project', subjectId: { not: municipalProjectId } },
      include: { definition: true },
    });
    expect(legacy!.definition.version).toBe(1);
  });

  it('v2 gates submission on complete sections, then runs voting into board_review', async () => {
    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', mayor)
      .send({ projectId: municipalProjectId, summary: 'Water network rehabilitation study' })
      .expect(201);
    studyId = study.body.data.id;
    expect(study.body.data.sections.map((s: { name: string }) => s.name)).toContain('Engineering Study');

    // sections_complete guard: submission is blocked while sections are open
    const early = await http()
      .patch(`/api/v1/study/${studyId}/status`)
      .set('Authorization', mayor)
      .send({ status: 'in_review' });
    expect(early.status).toBe(403);
    expect(early.body.message).toContain('sections_complete');

    await prisma.studySection.updateMany({
      where: { studyId },
      data: { status: 'completed', completedAt: new Date() },
    });
    await http()
      .patch(`/api/v1/study/${studyId}/status`)
      .set('Authorization', mayor)
      .send({ status: 'in_review' })
      .expect(200);

    // Board publishes and opens voting (a round is created by the engine effect)
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', board).send({ status: 'published' }).expect(200);
    await http()
      .patch(`/api/v1/study/${studyId}/status`)
      .set('Authorization', board)
      .send({ status: 'voting_open', votingEndsAt: new Date(Date.now() + DAY).toISOString() })
      .expect(200);
    const round = await prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId },
    });
    expect(round).not.toBeNull();

    // v2 window guard: closing early is refused until the window has ended
    const early2 = await http()
      .patch(`/api/v1/study/${studyId}/status`)
      .set('Authorization', board)
      .send({ status: 'voting_closed' });
    expect(early2.status).toBe(403);
    expect(early2.body.message).toContain('window_open');

    await prisma.projectStudy.update({ where: { id: studyId }, data: { votingEndsAt: new Date(Date.now() - DAY) } });
    await http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', board).send({ status: 'voting_closed' }).expect(200);
  });

  it('the Board decision routes through board_review; no donations open (capability off)', async () => {
    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', board)
      .send({
        subjectType: 'project_study',
        subjectId: studyId,
        decision: 'approved',
        rationale: 'Feasibility confirmed by the engineering review; pilot project approved.',
      })
      .expect(201);

    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: municipalProjectId } },
    });
    expect(instance!.currentStateKey).toBe('approved'); // NOT donations_open — canOpenDonations=false

    // denied transitions log nothing — the early submit attempt left no trace
    const steps = await prisma.workflowStepLog.findMany({
      where: { instance: { subjectType: 'project', subjectId: municipalProjectId } },
      orderBy: { id: 'asc' },
    });
    expect(steps.map((s) => s.actionKey)).toEqual([
      'start', 'submit', 'publish', 'open_voting', 'close_voting', 'send_to_board', 'approve',
    ]);

    // execution starts straight from approved (agreement-funded path, W6 pilot finding)
    await http()
      .post(`/api/v1/workflow/projects/${municipalProjectId}/execute`)
      .set('Authorization', mayor)
      .send({ action: 'begin_execution', note: 'contractor mobilized' })
      .expect(201);
    const executing = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: municipalProjectId } },
    });
    expect(executing!.currentStateKey).toBe('executing');
  });

  // ─── E1 — agreement → allocation → reports → money ──────────────────────────

  it('the Board signs a funding agreement with the municipality', async () => {
    const fund = await prisma.fund.findFirst({ where: { name: 'Development & Infrastructure' } });
    fundId = fund!.id;

    const created = await http()
      .post(`/api/v1/funds/${fundId}/agreements`)
      .set('Authorization', board)
      .send({
        organizationId: municipalityId,
        title: 'Al-Karama infrastructure funding agreement 2026',
        terms: { blockDisbursementsOnOverdueReports: true, graceDays: 0 },
        reportingSchedule: { frequency: 'monthly', reportTypes: ['progress', 'financial'] },
        startsAt: new Date(Date.now() - 65 * DAY).toISOString(),
      })
      .expect(201);
    agreementId = created.body.data.id;
    expect(created.body.data.status).toBe('draft');

    await http().post(`/api/v1/funds/agreements/${agreementId}/sign`).set('Authorization', board).expect(201);
    const detail = await http().get(`/api/v1/funds/agreements/${agreementId}`).set('Authorization', board).expect(200);
    expect(detail.body.data.status).toBe('active');
    // two elapsed monthly periods × two report types, all unsatisfied
    expect(detail.body.data.obligations).toHaveLength(4);
    expect(detail.body.data.overdueCount).toBe(4);
  });

  it('an allocation under the agreement passes the launch ceiling', async () => {
    // seed intake so the fund account carries real money
    const fundAccount = await treasury.fundAccount(fundId);
    const external = await treasury.ensureAccount('external', null, 'W6 ministry grant counterparty', 'income');
    await treasury.post(
      { userId: null, referenceType: 'system', requestId: 'w6-spec', ip: null } as never,
      {
        description: 'Ministry grant intake (spec fixture)',
        referenceType: 'spec_fixture',
        referenceId: 1,
        event: 'grant.received',
        entries: [
          { accountId: external.id, direction: 'debit', amount: 10000 },
          { accountId: fundAccount.id, direction: 'credit', amount: 10000 },
        ],
      },
    );

    const proposal = await http()
      .post(`/api/v1/funds/${fundId}/allocations`)
      .set('Authorization', board)
      .send({ projectId: municipalProjectId, amount: 5000, fundingAgreementId: agreementId, note: 'Phase 1 works' })
      .expect(201);
    allocationId = proposal.body.data.id;
    expect(proposal.body.data.fundingAgreementId).toBe(agreementId);

    const blocked = await http().post(`/api/v1/funds/allocations/${allocationId}/approve`).set('Authorization', board);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain('board_decision:approved-missing');

    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', board)
      .send({
        subjectType: 'fund_allocation',
        subjectId: allocationId,
        decision: 'approved',
        rationale: 'Pilot allocation under the Al-Karama agreement.',
      })
      .expect(201);
    const approved = await http().post(`/api/v1/funds/allocations/${allocationId}/approve`).set('Authorization', board).expect(201);
    expect(approved.body.data.status).toBe('board_approved');
  });

  it('overdue reports BLOCK disbursement until the municipality reports (incl. returned path)', async () => {
    const blocked = await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', board)
      .send({ amount: 2000 });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toContain('overdue report');

    // the mayor submits both report types covering the elapsed periods
    const periodStart = new Date(Date.now() - 65 * DAY).toISOString();
    const periodEnd = new Date().toISOString();
    const progress = await http()
      .post(`/api/v1/organizations/${municipalityId}/reports`)
      .set('Authorization', mayor)
      .send({
        type: 'progress',
        title: 'Water works — months 1–2 progress',
        fundingAgreementId: agreementId,
        projectId: municipalProjectId,
        periodStart,
        periodEnd,
        payload: { completion: '38%', milestones: ['pipes delivered', 'trenching 60%'] },
      })
      .expect(201);
    const financial = await http()
      .post(`/api/v1/organizations/${municipalityId}/reports`)
      .set('Authorization', mayor)
      .send({
        type: 'financial',
        title: 'Water works — months 1–2 financials',
        fundingAgreementId: agreementId,
        periodStart,
        periodEnd,
        payload: { spent: 0, committed: 3100 },
      })
      .expect(201);

    // Board queue sees them + the overdue flag clears as they satisfy periods
    const queue = await http().get('/api/v1/org-reports/queue').set('Authorization', board).expect(200);
    expect(queue.body.data.reports.map((r: { id: number }) => r.id)).toEqual(
      expect.arrayContaining([progress.body.data.id, financial.body.data.id]),
    );

    // returned-with-comments path on the financial report
    await http().post(`/api/v1/org-reports/${financial.body.data.id}/begin-review`).set('Authorization', board).expect(201);
    await http()
      .post(`/api/v1/org-reports/${financial.body.data.id}/return`)
      .set('Authorization', board)
      .send({ note: 'Committed amounts need the contractor invoice references.' })
      .expect(201);
    const returned = await prisma.organizationReport.findUnique({ where: { id: financial.body.data.id } });
    expect(returned!.status).toBe('returned');
    expect(returned!.reviewNote).toContain('invoice references');

    // a returned report does NOT satisfy its periods — disbursement still blocked
    const stillBlocked = await http()
      .post(`/api/v1/funds/allocations/${allocationId}/disburse`)
      .set('Authorization', board)
      .send({ amount: 2000 });
    expect(stillBlocked.status).toBe(400);

    await http()
      .post(`/api/v1/org-reports/${financial.body.data.id}/resubmit`)
      .set('Authorization', mayor)
      .send({ payload: { spent: 0, committed: 3100, invoices: ['INV-114', 'INV-115'] } })
      .expect(201);

    // both accepted (the DoD wants accepted reports, not merely submitted)
    for (const id of [progress.body.data.id, financial.body.data.id]) {
      await http().post(`/api/v1/org-reports/${id}/begin-review`).set('Authorization', board).expect(201);
      await http().post(`/api/v1/org-reports/${id}/accept`).set('Authorization', board).expect(201);
    }

    // …and the money moves: two tranches, reconcile, close
    await http().post(`/api/v1/funds/allocations/${allocationId}/disburse`).set('Authorization', board).send({ amount: 2000 }).expect(201);
    await http().post(`/api/v1/funds/allocations/${allocationId}/disburse`).set('Authorization', board).send({ amount: 3000 }).expect(201);
    const projectAccount = await treasury.projectAccount(municipalProjectId);
    expect(await treasury.balance(projectAccount.id)).toBe(5000);
    const fundAccount = await treasury.fundAccount(fundId);
    expect(await treasury.balance(fundAccount.id)).toBe(5000); // 10000 − 5000

    await http().post(`/api/v1/funds/allocations/${allocationId}/reconcile`).set('Authorization', board).expect(201);
    await http().post(`/api/v1/funds/allocations/${allocationId}/close`).set('Authorization', board).expect(201);
    const final = await prisma.fundAllocation.findUnique({ where: { id: allocationId } });
    expect(final!.status).toBe('closed');
  });

  // ─── E5 — joint project ──────────────────────────────────────────────────────

  it('an NGO project takes the municipality as executing agency; an engineer works via a project-scope grant', async () => {
    ({ projectId: jointProjectId } = await createProjectViaApi(app, board, 'w6-joint', { category: 'agricultural' }));

    await http()
      .post(`/api/v1/projects/${jointProjectId}/participations`)
      .set('Authorization', board)
      .send({ organizationId: municipalityId, role: 'executing_agency', notes: 'Municipal crews execute the field works' })
      .expect(201);

    const detail = await http().get(`/api/v1/projects/${jointProjectId}`).expect(200);
    expect(detail.body.data.participations).toHaveLength(1);
    expect(detail.body.data.participations[0].organization.id).toBe(municipalityId);
    expect(detail.body.data.participations[0].role).toBe('executing_agency');

    // the municipal engineer joins the municipality, then gets a contributor grant
    await http()
      .post(`/api/v1/organizations/${municipalityId}/invite-admin`)
      .set('Authorization', board)
      .send({
        email: 'engineer@alkarama.example.gov',
        firstName: 'Karim',
        lastName: 'Nasser',
        password: 'Engineer@123',
        role: 'staff',
      })
      .expect(201);
    const engineerUser = await prisma.user.findUnique({ where: { email: 'engineer@alkarama.example.gov' } });
    engineer = { userId: engineerUser!.id, auth: await login('engineer@alkarama.example.gov', 'Engineer@123') };

    // a participating org's member cannot expand their own access…
    await http()
      .post(`/api/v1/projects/${jointProjectId}/participations/grants`)
      .set('Authorization', engineer.auth)
      .send({ userId: engineer.userId, role: 'contributor' })
      .expect(403);
    // …the owner org / Board grants it
    await http()
      .post(`/api/v1/projects/${jointProjectId}/participations/grants`)
      .set('Authorization', board)
      .send({ userId: engineer.userId, role: 'contributor' })
      .expect(201);

    // the assignee picker now offers the engineer (W6-E5-S1 AC)
    const assignable = await http()
      .get(`/api/v1/projects/${jointProjectId}/participations/assignable-users`)
      .set('Authorization', board)
      .expect(200);
    const entry = assignable.body.data.find((u: { userId: number }) => u.userId === engineer.userId);
    expect(entry).toBeDefined();
    expect(entry.projectRoles).toContain('contributor');

    // owner assigns a task to the engineer (W2 D2 user-FK)
    const taskBlockId = await createBlockViaApi(app, board, 'w6-joint-task');
    const task = await http()
      .post(`/api/v1/projects/${jointProjectId}/execution/tasks`)
      .set('Authorization', board)
      .send({ blockId: taskBlockId, assignedToUserId: engineer.userId })
      .expect(201);

    // the engineer sees the joint project and completes the task
    await http().get(`/api/v1/projects/${jointProjectId}`).set('Authorization', engineer.auth).expect(200);
    const done = await http()
      .patch(`/api/v1/projects/${jointProjectId}/execution/tasks/${task.body.data.id}`)
      .set('Authorization', engineer.auth)
      .send({ status: 'completed' })
      .expect(200);
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.assignedToUserId).toBe(engineer.userId);
  });

  it('leak test: the grant scopes to that project only', async () => {
    // another NGO project the municipality has no part in
    const { projectId: privateProjectId } = await createProjectViaApi(app, board, 'w6-private', { category: 'trading' });

    // detail read is refused as nonexistence (tenancy layer)
    await http().get(`/api/v1/projects/${privateProjectId}`).set('Authorization', engineer.auth).expect(404);
    // the execution surface denies at the policy layer (uniform 403 — the
    // engineer holds no grant there, whether or not the project exists)
    await http()
      .get(`/api/v1/projects/${privateProjectId}/execution/tasks`)
      .set('Authorization', engineer.auth)
      .expect(403);
    // and the engineer's project list carries the joint project, not the private one
    const list = await http().get('/api/v1/projects?limit=100').set('Authorization', engineer.auth).expect(200);
    const ids = (list.body.data.data as Array<{ id: number }>).map((p) => p.id);
    expect(ids).toContain(jointProjectId);
    expect(ids).not.toContain(privateProjectId);
  });

  // ─── E4-S2 — emergency relief fast track ─────────────────────────────────────

  it('emergency-relief: Board-only initiation, decision-gated fast track, no public voting', async () => {
    // a non-Board org admin cannot initiate the fast track
    const mayorBlockId = await createBlockViaApi(app, mayor, 'w6-emergency-denied');
    await http()
      .post('/api/v1/projects')
      .set('Authorization', mayor)
      .send({ blockId: mayorBlockId, value: 15000, categoryKey: 'emergency_relief', lifecycle: 'emergency-relief' })
      .expect(403);

    const blockId = await createBlockViaApi(app, board, 'w6-emergency');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', board)
      .send({ blockId, value: 15000, categoryKey: 'emergency_relief', lifecycle: 'emergency-relief' })
      .expect(201);
    emergencyProjectId = created.body.data.id;

    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: emergencyProjectId } },
      include: { definition: true },
    });
    expect(instance!.definition.key).toBe('emergency-relief');

    const exec = (action: string, expectStatus = 201) =>
      http()
        .post(`/api/v1/workflow/projects/${emergencyProjectId}/execute`)
        .set('Authorization', board)
        .send({ action })
        .expect(expectStatus);

    await exec('submit'); // draft → board_review

    // the decision guard holds on the PROJECT subject (no study exists)
    const blocked = await http()
      .post(`/api/v1/workflow/projects/${emergencyProjectId}/execute`)
      .set('Authorization', board)
      .send({ action: 'approve' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain('board_decision:approved-missing');

    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', board)
      .send({
        subjectType: 'project',
        subjectId: emergencyProjectId,
        decision: 'approved',
        rationale: 'Flash-flood response — fast-tracked by unanimous Board session.',
      })
      .expect(201);

    await exec('approve');
    await exec('begin_execution');
    await exec('complete');

    const done = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: emergencyProjectId } },
    });
    expect(done!.currentStateKey).toBe('completed');
    const project = await prisma.project.findUnique({ where: { id: emergencyProjectId } });
    expect(project!.isCompleted).toBe(true);

    // no public voting ever happened on the fast track
    const rounds = await prisma.voteRound.count({
      where: { subjectType: 'project_study', subjectId: emergencyProjectId },
    });
    expect(rounds).toBe(0);
  });

  // ─── Cross-cutting: legacy parity stays clean with W6 states in play ─────────

  it('the workflow parity sweep is clean across v1, v2, and emergency instances', async () => {
    const parity = app.get(WorkflowParityService);
    expect(await parity.check()).toEqual([]);
  });
});
