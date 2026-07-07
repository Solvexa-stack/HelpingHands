import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { authHeaderFor } from './utils/auth';

/**
 * W0-E1-S2 — Frozen lifecycle spec: project → study → vote → approval.
 *
 * This is the backward-compatibility contract from
 * workspaceroadmap/01_CURRENT_SYSTEM_ANALYSIS.md: the StudyStatus state
 * machine (draft → in_review → published → voting_open → voting_closed →
 * approved | rejected) must keep working unchanged until Wave 4 wraps it.
 * Tests within each describe block are sequential steps of one lifecycle
 * run and intentionally share state.
 */
describe('Frozen lifecycle: project → study → vote → approval (W0-E1-S2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let officer: string;
  let participant: string;
  let employeeAdminId: number;
  let adminAdminId: number;

  const http = () => request(app.getHttpServer());

  const createProjectViaApi = async (slug: string): Promise<{ blockId: number; projectId: number }> => {
    const blockRes = await http()
      .post('/api/v1/blocks')
      .set('Authorization', employee)
      .send({
        category: 'project',
        translations: [
          {
            languageCode: 'en',
            name: `Lifecycle project ${slug}`,
            slug: `lifecycle-project-${slug}`,
            brief: 'E2E lifecycle fixture',
            description: 'Project used by the frozen-lifecycle regression spec',
          },
        ],
      })
      .expect(201);

    const projectRes = await http()
      .post('/api/v1/projects')
      .set('Authorization', employee)
      .send({ blockId: blockRes.body.data.id, value: 50000, category: 'agricultural' })
      .expect(201);

    return { blockId: blockRes.body.data.id, projectId: projectRes.body.data.id };
  };

  const getStudy = async (studyId: number) => {
    const res = await http()
      .get(`/api/v1/study/${studyId}`)
      .set('Authorization', employee)
      .expect(200);
    return res.body.data;
  };

  const changeStatus = (studyId: number, body: Record<string, unknown>, auth: string) =>
    http().patch(`/api/v1/study/${studyId}/status`).set('Authorization', auth).send(body);

  /** Asserts the Project.studyStatus mirror column stays in sync. */
  const expectMirroredStatus = async (projectId: number, status: string | null) => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.studyStatus ?? null).toBe(status);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    [admin, employee, officer, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'financial_officer'),
      authHeaderFor(prisma, 'participant'),
    ]);

    const employeeUser = await prisma.user.findUnique({
      where: { email: 'employee@helpinghands.org' },
    });
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@helpinghands.org' },
    });
    employeeAdminId = employeeUser!.referenceId;
    adminAdminId = adminUser!.referenceId;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Approval path ────────────────────────────────────────────────────────────

  describe('approval path', () => {
    let projectId: number;
    let studyId: number;
    let sectionIds: number[];
    const statusHistory: string[] = [];

    it('employee creates a project', async () => {
      ({ projectId } = await createProjectViaApi('approve'));
      await expectMirroredStatus(projectId, null);
    });

    it('participants and financial officers cannot create studies', async () => {
      await http()
        .post('/api/v1/study')
        .set('Authorization', participant)
        .send({ projectId })
        .expect(403);
      await http()
        .post('/api/v1/study')
        .set('Authorization', officer)
        .send({ projectId })
        .expect(403);
    });

    it('employee creates the study; sections auto-populate from StudyDepartmentTemplate', async () => {
      const res = await http()
        .post('/api/v1/study')
        .set('Authorization', employee)
        .send({ projectId, summary: 'Frozen lifecycle run' })
        .expect(201);

      const study = res.body.data;
      studyId = study.id;
      statusHistory.push(study.status);

      const templates = await prisma.studyDepartmentTemplate.findMany({
        where: { projectType: 'agricultural', isActive: true },
        orderBy: { order: 'asc' },
      });
      expect(templates.length).toBeGreaterThan(0);

      expect(study.status).toBe('draft');
      expect(study.sections).toHaveLength(templates.length);
      expect(study.sections.map((s: any) => s.name)).toEqual(templates.map((t) => t.name));
      expect(study.sections.every((s: any) => s.status === 'pending')).toBe(true);

      sectionIds = study.sections.map((s: any) => s.id);
      await expectMirroredStatus(projectId, 'draft');
    });

    it('a project cannot have two studies', async () => {
      await http()
        .post('/api/v1/study')
        .set('Authorization', employee)
        .send({ projectId })
        .expect(400);
    });

    it('a draft study cannot jump straight to published (invalid transition)', async () => {
      const res = await changeStatus(studyId, { status: 'published' }, admin).expect(400);
      expect(res.body.message).toContain('Cannot transition');
    });

    it('an employee not assigned to a section cannot update it', async () => {
      await http()
        .patch(`/api/v1/study/sections/${sectionIds[0]}`)
        .set('Authorization', employee)
        .send({ status: 'in_progress' })
        .expect(403);
    });

    it('administrator assigns every section to the employee', async () => {
      for (const sectionId of sectionIds) {
        const res = await http()
          .patch(`/api/v1/study/sections/${sectionId}`)
          .set('Authorization', admin)
          .send({ assignedTo: employeeAdminId })
          .expect(200);
        expect(res.body.data.assignedTo).toBe(employeeAdminId);
      }
    });

    it('study stays draft until the last required section is completed, then auto-moves to in_review', async () => {
      for (const sectionId of sectionIds.slice(0, -1)) {
        await http()
          .patch(`/api/v1/study/sections/${sectionId}`)
          .set('Authorization', employee)
          .send({ content: 'Section findings', status: 'completed' })
          .expect(200);
      }
      expect((await getStudy(studyId)).status).toBe('draft');

      const res = await http()
        .patch(`/api/v1/study/sections/${sectionIds[sectionIds.length - 1]}`)
        .set('Authorization', employee)
        .send({ content: 'Final section findings', status: 'completed' })
        .expect(200);
      expect(res.body.data.completedAt).toBeTruthy();

      const study = await getStudy(studyId);
      expect(study.status).toBe('in_review');
      statusHistory.push(study.status);
      await expectMirroredStatus(projectId, 'in_review');
    });

    it('employee cannot publish (admin-only transition)', async () => {
      await changeStatus(studyId, { status: 'published' }, employee).expect(403);
    });

    it('the public cannot see the study before publication', async () => {
      await http().get(`/api/v1/study/project/${projectId}`).expect(404);
    });

    it('administrator publishes the study', async () => {
      const res = await changeStatus(studyId, { status: 'published' }, admin).expect(200);
      expect(res.body.data.status).toBe('published');
      expect(res.body.data.publishedAt).toBeTruthy();
      statusHistory.push(res.body.data.status);
      await expectMirroredStatus(projectId, 'published');

      const publicRes = await http().get(`/api/v1/study/project/${projectId}`).expect(200);
      expect(publicRes.body.data.id).toBe(studyId);
    });

    it('votes cannot be cast before voting opens', async () => {
      await http()
        .post('/api/v1/voting/cast')
        .set('Authorization', participant)
        .send({ studyId, choice: 'for' })
        .expect(400);
    });

    it('employee cannot open voting (admin-only transition)', async () => {
      await changeStatus(studyId, { status: 'voting_open' }, employee).expect(403);
    });

    it('administrator opens voting', async () => {
      const votingEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await changeStatus(studyId, { status: 'voting_open', votingEndsAt }, admin).expect(200);
      expect(res.body.data.status).toBe('voting_open');
      expect(res.body.data.votingStartsAt).toBeTruthy();
      statusHistory.push(res.body.data.status);
      await expectMirroredStatus(projectId, 'voting_open');
    });

    it('every seeded user casts exactly one vote (for / against / abstain)', async () => {
      const votes: Array<[string, string]> = [
        [admin, 'for'],
        [employee, 'against'],
        [officer, 'abstain'],
        [participant, 'against'],
      ];
      for (const [auth, choice] of votes) {
        const res = await http()
          .post('/api/v1/voting/cast')
          .set('Authorization', auth)
          .send({ studyId, choice, comment: `Voted ${choice}` })
          .expect(201);
        expect(res.body.data.choice).toBe(choice);
      }
    });

    it('a user cannot vote twice on the same study', async () => {
      await http()
        .post('/api/v1/voting/cast')
        .set('Authorization', participant)
        .send({ studyId, choice: 'for' })
        .expect(409);
    });

    it('a voter can change their vote while voting is open', async () => {
      const res = await http()
        .patch(`/api/v1/voting/${studyId}/change`)
        .set('Authorization', participant)
        .send({ choice: 'for' })
        .expect(200);
      expect(res.body.data.choice).toBe('for');
    });

    it('public results reflect the tallies', async () => {
      const res = await http().get(`/api/v1/voting/${studyId}/results`).expect(200);
      expect(res.body.data.total).toBe(4);
      expect(res.body.data.for.count).toBe(2);
      expect(res.body.data.against.count).toBe(1);
      expect(res.body.data.abstain.count).toBe(1);
    });

    it('only administrators can list individual votes', async () => {
      await http().get(`/api/v1/voting/${studyId}/votes`).set('Authorization', employee).expect(403);
      const res = await http()
        .get(`/api/v1/voting/${studyId}/votes`)
        .set('Authorization', admin)
        .expect(200);
      expect(res.body.data.data).toHaveLength(4);
    });

    it('administrator closes voting', async () => {
      const res = await changeStatus(studyId, { status: 'voting_closed' }, admin).expect(200);
      expect(res.body.data.status).toBe('voting_closed');
      statusHistory.push(res.body.data.status);
      await expectMirroredStatus(projectId, 'voting_closed');
    });

    it('vote changes are rejected after voting closes', async () => {
      await http()
        .patch(`/api/v1/voting/${studyId}/change`)
        .set('Authorization', participant)
        .send({ choice: 'against' })
        .expect(400);
    });

    it('employee cannot approve (admin-only transition)', async () => {
      await changeStatus(studyId, { status: 'approved' }, employee).expect(403);
    });

    it('administrator approves the study', async () => {
      const res = await changeStatus(studyId, { status: 'approved' }, admin).expect(200);
      expect(res.body.data.status).toBe('approved');
      expect(res.body.data.approvedById).toBe(adminAdminId);
      expect(res.body.data.approvedAt).toBeTruthy();
      statusHistory.push(res.body.data.status);
      await expectMirroredStatus(projectId, 'approved');
    });

    it('the observed StudyStatus sequence matches the frozen lifecycle', () => {
      expect(statusHistory).toEqual([
        'draft',
        'in_review',
        'published',
        'voting_open',
        'voting_closed',
        'approved',
      ]);
    });
  });

  // ─── Rejection path ───────────────────────────────────────────────────────────

  describe('rejection path', () => {
    let projectId: number;
    let studyId: number;
    const statusHistory: string[] = [];

    it('employee creates a second project with a study', async () => {
      ({ projectId } = await createProjectViaApi('reject'));
      const res = await http()
        .post('/api/v1/study')
        .set('Authorization', employee)
        .send({ projectId, summary: 'Rejection path run' })
        .expect(201);
      studyId = res.body.data.id;
      statusHistory.push(res.body.data.status);
    });

    it('employee can submit the draft for review (not an admin-only transition)', async () => {
      const res = await changeStatus(studyId, { status: 'in_review' }, employee).expect(200);
      expect(res.body.data.status).toBe('in_review');
      statusHistory.push(res.body.data.status);
    });

    it('administrator walks the study to voting_closed', async () => {
      for (const status of ['published', 'voting_open', 'voting_closed'] as const) {
        const res = await changeStatus(studyId, { status }, admin).expect(200);
        expect(res.body.data.status).toBe(status);
        statusHistory.push(res.body.data.status);
      }
      await expectMirroredStatus(projectId, 'voting_closed');
    });

    it('rejection without a reason is refused', async () => {
      const res = await changeStatus(studyId, { status: 'rejected' }, admin).expect(400);
      expect(res.body.message).toContain('Rejection reason is required');
    });

    it('employee cannot reject (admin-only transition)', async () => {
      await changeStatus(
        studyId,
        { status: 'rejected', rejectionReason: 'Not viable' },
        employee,
      ).expect(403);
    });

    it('administrator rejects with a reason', async () => {
      const res = await changeStatus(
        studyId,
        { status: 'rejected', rejectionReason: 'Feasibility study shows insufficient water access' },
        admin,
      ).expect(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe(
        'Feasibility study shows insufficient water access',
      );
      statusHistory.push(res.body.data.status);
      await expectMirroredStatus(projectId, 'rejected');
    });

    it('rejected is terminal — no further transitions or votes', async () => {
      await changeStatus(studyId, { status: 'in_review' }, admin).expect(400);
      await http()
        .post('/api/v1/voting/cast')
        .set('Authorization', participant)
        .send({ studyId, choice: 'for' })
        .expect(400);
    });

    it('the observed StudyStatus sequence matches the frozen rejection path', () => {
      expect(statusHistory).toEqual([
        'draft',
        'in_review',
        'published',
        'voting_open',
        'voting_closed',
        'rejected',
      ]);
    });
  });
});
