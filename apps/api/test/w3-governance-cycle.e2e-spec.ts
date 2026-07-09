import { INestApplication } from '@nestjs/common';
import { execSync } from 'child_process';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { DecisionParityService } from '../src/modules/governance/decision-parity.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { DATABASE_PACKAGE_DIR } from './test-env';

/**
 * W3-E6-S1 — the permanent governance-cycle spec. Full study voting cycle on
 * VoteRound/Vote with StudyVote frozen; every approval produces an immutable
 * BoardDecision with rationale; changes_requested returns the study to
 * revision with the rationale visible to the owning org; the Board queue is
 * cross-org and Board-only; governance transitions are gated on Board
 * permissions (not the administrator enum); audit trail carries decision +
 * votes; the StudyVote→rounds backfill preserves tallies exactly.
 */
describe('Governance cycle (W3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let parity: DecisionParityService;
  let boardChair: string; // seeded administrator = board_chair (W1 backfill)
  let boardMember: string; // employee-enum admin with a board_member grant
  let orgAdmin: string; // pilot org admin — no platform grants
  let participant: string;
  let orgId: number;
  let projectId: number;
  let studyId: number;

  const http = () => request(app.getHttpServer());
  const patchStatus = (auth: string, status: string, extra: object = {}) =>
    http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', auth).send({ status, ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    parity = app.get(DecisionParityService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';

    [boardChair, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'participant'),
    ]);

    // Board member: employee-enum admin + platform board_member grant — the
    // proof that governance runs on Board permissions, not the enum (D5).
    const memberAdmin = await prisma.admin.create({
      data: { firstName: 'Bella', lastName: 'Board', role: 'employee' },
    });
    const memberUser = await prisma.user.create({
      data: {
        referenceId: memberAdmin.id,
        referenceType: 'admin',
        email: 'board.member@example.com',
        password: await bcrypt.hash('Board@12345', 12),
        isActive: true,
        joiningDate: new Date(),
      },
    });
    const defaultOrg = await prisma.organization.findFirst({ where: { type: 'ngo', name: 'HelpingHands' } });
    const boardOrg = await prisma.organization.findFirst({ where: { type: 'board' } });
    await prisma.organizationMembership.create({
      data: { organizationId: (boardOrg ?? defaultOrg)!.id, userId: memberUser.id },
    });
    await prisma.roleAssignment.createMany({
      data: [
        { userId: memberUser.id, role: 'board_member', scopeType: 'platform' },
        { userId: memberUser.id, role: 'staff', scopeType: 'organization', scopeId: defaultOrg!.id },
      ],
    });
    const memberLogin = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'board.member@example.com', password: 'Board@12345' })
      .expect(200);
    boardMember = `Bearer ${memberLogin.body.data.accessToken}`;

    // Pilot org with its own study (invisible to other orgs, visible to Board)
    const org = await http()
      .post('/api/v1/organizations')
      .set('Authorization', boardChair)
      .send({ type: 'ngo', name: 'Governance Pilot NGO' })
      .expect(201);
    orgId = org.body.data.id;
    await http()
      .put(`/api/v1/organizations/${orgId}`)
      .set('Authorization', boardChair)
      .send({ status: 'active' })
      .expect(200);
    await http()
      .post(`/api/v1/organizations/${orgId}/invite-admin`)
      .set('Authorization', boardChair)
      .send({ email: 'gov.pilot@example.com', firstName: 'Gov', lastName: 'Pilot' })
      .expect(201);
    const reset = await prisma.passwordResetToken.findFirst({ where: { email: 'gov.pilot@example.com' } });
    await http().post('/api/v1/auth/reset-password').send({ token: reset!.token, password: 'Pilot@12345' }).expect(200);
    const login = await http().post('/api/v1/auth/login').send({ email: 'gov.pilot@example.com', password: 'Pilot@12345' }).expect(200);
    orgAdmin = `Bearer ${login.body.data.accessToken}`;

    const block = await http()
      .post('/api/v1/blocks')
      .set('Authorization', orgAdmin)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: 'Governance well', slug: 'governance-well', brief: 'b', description: 'd' }],
      })
      .expect(201);
    const project = await http()
      .post('/api/v1/projects')
      .set('Authorization', orgAdmin)
      .send({ blockId: block.body.data.id, value: 1000, category: 'agricultural' })
      .expect(201);
    projectId = project.body.data.id;
    const study = await http().post('/api/v1/study').set('Authorization', orgAdmin).send({ projectId }).expect(201);
    studyId = study.body.data.id;
    // complete all sections (board chair may edit any section) → auto in_review
    for (const section of study.body.data.sections) {
      await http()
        .patch(`/api/v1/study/sections/${section.id}`)
        .set('Authorization', boardChair)
        .send({ status: 'completed' })
        .expect(200);
    }
    const inReview = await prisma.projectStudy.findUnique({ where: { id: studyId } });
    expect(inReview!.status).toBe('in_review');
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    await app.close();
  });

  it('the Board queue is cross-org, and Board-only', async () => {
    const queue = await http().get('/api/v1/governance/queue').set('Authorization', boardChair).expect(200);
    const item = queue.body.data.find((i: any) => i.studyId === studyId);
    expect(item).toBeDefined();
    expect(item.organization.id).toBe(orgId);
    expect(item.status).toBe('in_review');

    await http().get('/api/v1/governance/queue').set('Authorization', boardMember).expect(200);
    await http().get('/api/v1/governance/queue').set('Authorization', orgAdmin).expect(403);
    await http().get('/api/v1/governance/queue').set('Authorization', participant).expect(403);
  });

  it('org admins cannot perform governance transitions; a board_member (employee enum) can', async () => {
    await patchStatus(orgAdmin, 'published').expect(403);
    // board_member is NOT an administrator-enum user — Board permission decides (D5 closed)
    await patchStatus(boardMember, 'published').expect(200);
  });

  it('changes_requested returns the study to revision with the rationale visible to the owning org', async () => {
    // back up: published is not decidable — revert through the machine to in_review first
    await prisma.projectStudy.update({ where: { id: studyId }, data: { status: 'in_review' } });

    const decision = await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', boardMember)
      .send({
        subjectType: 'project_study',
        subjectId: studyId,
        decision: 'changes_requested',
        rationale: 'Budget section needs itemized costs before the Board can proceed.',
      })
      .expect(201);
    expect(decision.body.data.decision).toBe('changes_requested');

    const study = await prisma.projectStudy.findUnique({ where: { id: studyId } });
    expect(study!.status).toBe('draft'); // revision — editable again

    // owning org sees the rationale on the study detail
    const detail = await http().get(`/api/v1/study/${studyId}`).set('Authorization', orgAdmin).expect(200);
    const cr = detail.body.data.decisions.find((d: any) => d.decision === 'changes_requested');
    expect(cr.rationale).toContain('itemized costs');

    // decisions are immutable: no update/delete route exists
    await http().put(`/api/v1/governance/decisions/${decision.body.data.id}`).set('Authorization', boardChair).expect(404);
    await http().delete(`/api/v1/governance/decisions/${decision.body.data.id}`).set('Authorization', boardChair).expect(404);
  });

  it('a decision without rationale is rejected', async () => {
    await http()
      .post('/api/v1/governance/decisions')
      .set('Authorization', boardChair)
      .send({ subjectType: 'project_study', subjectId: studyId, decision: 'approved', rationale: '' })
      .expect(400);
  });

  it('resubmission runs the full voting cycle on VoteRound/Vote with StudyVote frozen', async () => {
    // resubmit: re-complete a section → auto in_review, then publish + open voting
    const sections = await prisma.studySection.findMany({ where: { studyId } });
    await http()
      .patch(`/api/v1/study/sections/${sections[0].id}`)
      .set('Authorization', boardChair)
      .send({ status: 'completed' })
      .expect(200);
    await patchStatus(boardChair, 'published').expect(200);
    const votingEndsAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
    await patchStatus(boardChair, 'voting_open', { votingEndsAt }).expect(200);

    // the round is the representation
    const round = await prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId, status: 'open' },
    });
    expect(round).not.toBeNull();

    // legacy voting endpoints keep their contracts, now writing Vote rows
    const vote = await http()
      .post('/api/v1/voting/cast')
      .set('Authorization', participant)
      .send({ studyId, choice: 'for', comment: 'Well thought out' })
      .expect(201);
    expect(vote.body.data.studyId).toBe(studyId);
    await http()
      .post('/api/v1/voting/cast')
      .set('Authorization', participant)
      .send({ studyId, choice: 'against' })
      .expect(409); // duplicate

    const employee = await authHeaderFor(prisma, 'employee');
    await http().post('/api/v1/voting/cast').set('Authorization', employee).send({ studyId, choice: 'against' }).expect(201);

    const votes = await prisma.vote.count({ where: { voteRoundId: round!.id } });
    expect(votes).toBe(2);
    const legacyVotes = await prisma.studyVote.count({ where: { studyId } });
    expect(legacyVotes).toBe(0); // frozen — nothing writes it

    // StudyVote is frozen: an application write throws
    await expect(
      prisma.studyVote.create({ data: { studyId, userId: 1, choice: 'for' } }),
    ).rejects.toThrow(/frozen/);

    // results read from the round
    const results = await http().get(`/api/v1/voting/${studyId}/results`).set('Authorization', participant).expect(200);
    expect(results.body.data.total).toBe(2);
    expect(results.body.data.for.count).toBe(1);
    expect(results.body.data.myVote).toBe('for');

    // close: tally recorded on the round
    await patchStatus(boardChair, 'voting_closed').expect(200);
    const closed = await prisma.voteRound.findUnique({ where: { id: round!.id } });
    expect(closed!.status).toBe('closed');
    expect(closed!.result).toMatchObject({ for: 1, against: 1, abstain: 0, total: 2 });
  });

  it('approval produces an immutable BoardDecision; legacy columns synced; parity clean', async () => {
    await patchStatus(boardChair, 'approved', { rationale: 'Community support confirmed by vote; budget verified.' }).expect(200);

    const study = await prisma.projectStudy.findUnique({ where: { id: studyId } });
    expect(study!.status).toBe('approved');
    expect(study!.approvedAt).not.toBeNull();
    expect(study!.approvedByUserId).not.toBeNull(); // legacy sync (new→old)

    const decision = await prisma.boardDecision.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId, decision: 'approved' },
    });
    expect(decision).not.toBeNull();
    expect(decision!.rationale).toContain('Community support');
    expect(decision!.voteRoundId).not.toBeNull(); // linked to the cycle's round

    expect(await parity.check()).toEqual([]);
  });

  it('audit trail carries the decision and every vote of the cycle (DoD spot-check)', async () => {
    const decisionAudits = await prisma.auditLog.findMany({ where: { action: 'board_decision.recorded' } });
    expect(decisionAudits.length).toBeGreaterThanOrEqual(2); // changes_requested + approved
    const voteAudits = await prisma.auditLog.findMany({ where: { action: 'vote.cast' } });
    expect(voteAudits.length).toBeGreaterThanOrEqual(2);
    const roundAudits = await prisma.auditLog.findMany({
      where: { action: { in: ['vote_round.opened', 'vote_round.closed'] } },
    });
    expect(roundAudits.length).toBeGreaterThanOrEqual(2);
  });

  it('board-eligibility rounds refuse non-board voters; quorum/threshold evaluated at close', async () => {
    const round = await http()
      .post('/api/v1/governance/rounds')
      .set('Authorization', boardChair)
      .send({
        subjectType: 'organization',
        subjectId: orgId,
        eligibility: { type: 'board' },
        rules: { quorum: 2, threshold: 0.5 },
      })
      .expect(201);
    const roundId = round.body.data.id;

    await http()
      .post(`/api/v1/governance/rounds/${roundId}/votes`)
      .set('Authorization', participant)
      .send({ choice: 'for' })
      .expect(403); // not a board voter
    await http().post(`/api/v1/governance/rounds/${roundId}/votes`).set('Authorization', boardChair).send({ choice: 'for' }).expect(201);
    await http().post(`/api/v1/governance/rounds/${roundId}/votes`).set('Authorization', boardMember).send({ choice: 'for' }).expect(201);

    const closed = await http()
      .patch(`/api/v1/governance/rounds/${roundId}/close`)
      .set('Authorization', boardChair)
      .expect(200);
    expect(closed.body.data.result).toMatchObject({ total: 2, for: 2, passed: true });

    // org admins cannot open or close rounds
    await http()
      .post('/api/v1/governance/rounds')
      .set('Authorization', orgAdmin)
      .send({ subjectType: 'organization', subjectId: orgId })
      .expect(403);
  });

  it('backfill migrates legacy StudyVote history into rounds with tallies exactly equal', async () => {
    // Fabricate a pre-W3 study with legacy votes (raw SQL bypasses the freeze — by design)
    const legacyProject = await prisma.project.findFirst({ where: { id: { not: projectId } } });
    const legacyStudy = await prisma.projectStudy.create({
      data: {
        projectId: legacyProject!.id,
        status: 'voting_closed',
        votingStartsAt: new Date(Date.now() - 48 * 3_600_000),
        votingEndsAt: new Date(Date.now() - 24 * 3_600_000),
        createdById: 1,
      },
    });
    const voters = await prisma.user.findMany({ take: 3, orderBy: { id: 'asc' } });
    const choices = ['for', 'for', 'against'];
    for (let i = 0; i < voters.length; i++) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO study_votes (study_id, user_id, choice, created_at) VALUES ($1, $2, $3::"VoteChoice", now())`,
        legacyStudy.id,
        voters[i].id,
        choices[i],
      );
    }

    // the seed re-runs the idempotent backfill and fails on tally mismatch
    execSync('pnpm run db:seed', { cwd: DATABASE_PACKAGE_DIR, env: { ...process.env }, stdio: 'pipe' });

    const round = await prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: legacyStudy.id },
    });
    expect(round).not.toBeNull();
    expect(round!.status).toBe('closed');
    expect(round!.result).toMatchObject({ for: 2, against: 1, total: 3 });
    const migrated = await prisma.vote.groupBy({
      by: ['choice'],
      where: { voteRoundId: round!.id },
      _count: { choice: true },
    });
    expect(migrated.find((g) => g.choice === 'for')?._count.choice).toBe(2);
    expect(migrated.find((g) => g.choice === 'against')?._count.choice).toBe(1);
  });
});
