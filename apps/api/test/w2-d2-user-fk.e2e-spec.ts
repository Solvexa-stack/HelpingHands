import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor, SEED_ACCOUNTS } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

/**
 * W2-E2-S2 — Admin-FK → User-FK dual-write and assignee cutover; assigning a
 * non-Admin org member to a task works end-to-end.
 */
describe('D2 user-FK dual-write (W2-E2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let employee: string;
  let participant: string;
  let employeeUserId: number;
  let participantUserId: number;
  let projectId: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    [admin, employee, participant] = await Promise.all([
      authHeaderFor(prisma, 'administrator'),
      authHeaderFor(prisma, 'employee'),
      authHeaderFor(prisma, 'participant'),
    ]);
    employeeUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.employee.email } }))!.id;
    participantUserId = (await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.participant.email } }))!.id;
    ({ projectId } = await createProjectViaApi(app, employee, 'w2-d2', { value: 1000 }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('study create/approve and section assignment write both FK generations', async () => {
    const study = (await http().post('/api/v1/study').set('Authorization', employee).send({ projectId }).expect(201)).body.data;
    const row = await prisma.projectStudy.findUnique({ where: { id: study.id } });
    expect(row!.createdById).toBe(2); // legacy Admin-FK (employee admin id)
    expect(row!.createdByUserId).toBe(employeeUserId); // twin

    const sectionId = study.sections[0].id;
    await http().patch(`/api/v1/study/sections/${sectionId}`).set('Authorization', admin).send({ assignedTo: 2 }).expect(200);
    const section = await prisma.studySection.findUnique({ where: { id: sectionId } });
    expect(section!.assignedTo).toBe(2);
    expect(section!.assignedToUserId).toBe(employeeUserId);

    // assignee check now reads the User-FK: the assigned employee may edit
    await http().patch(`/api/v1/study/sections/${sectionId}`).set('Authorization', employee).send({ content: 'ok' }).expect(200);

    await http().patch(`/api/v1/study/${study.id}/status`).set('Authorization', employee).send({ status: 'in_review' }).expect(200);
    await http().patch(`/api/v1/study/${study.id}/status`).set('Authorization', admin).send({ status: 'published' }).expect(200);
    await http().patch(`/api/v1/study/${study.id}/status`).set('Authorization', admin).send({ status: 'voting_open' }).expect(200);
    await http().patch(`/api/v1/study/${study.id}/status`).set('Authorization', admin).send({ status: 'voting_closed' }).expect(200);
    await http().patch(`/api/v1/study/${study.id}/status`).set('Authorization', admin).send({ status: 'approved' }).expect(200);
    const approved = await prisma.projectStudy.findUnique({ where: { id: study.id } });
    expect(approved!.approvedById).toBe(1);
    expect(approved!.approvedByUserId).toBe((await prisma.user.findUnique({ where: { email: SEED_ACCOUNTS.administrator.email } }))!.id);
  });

  it('donation approval writes both generations', async () => {
    const pledge = (await http().post('/api/v1/donations').set('Authorization', participant).send({ projectId, amount: 10 }).expect(201)).body.data;
    await http().patch(`/api/v1/donations/${pledge.id}/status`).set('Authorization', employee).send({ status: 'approved' }).expect(200);

    const row = await prisma.projectDonation.findUnique({ where: { id: pledge.id } });
    expect(row!.approvedBy).toBe(2);
    expect(row!.approvedByUserId).toBe(employeeUserId);
  });

  it('legacy admin task assignment dual-writes the twin', async () => {
    const blockId = await createBlockViaApi(app, employee, 'w2-d2-task-a');
    const task = (await http().post(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).send({ blockId, assignedToId: 2 }).expect(201)).body.data;
    const row = await prisma.projectTask.findUnique({ where: { id: task.id } });
    expect(row!.assignedToId).toBe(2);
    expect(row!.assignedToUserId).toBe(employeeUserId);
  });

  it('a non-Admin org member can be assigned to a task end-to-end (S2 AC)', async () => {
    // participant joins the default org as a member
    const org = await prisma.organization.findFirst({ where: { type: 'ngo' } });
    await http().post(`/api/v1/organizations/${org!.id}/members`).set('Authorization', admin).send({ userId: participantUserId }).expect(201);

    const blockId = await createBlockViaApi(app, employee, 'w2-d2-task-b');
    const task = (
      await http()
        .post(`/api/v1/projects/${projectId}/execution/tasks`)
        .set('Authorization', employee)
        .send({ blockId, assignedToUserId: participantUserId })
        .expect(201)
    ).body.data;

    const row = await prisma.projectTask.findUnique({ where: { id: task.id } });
    expect(row!.assignedToUserId).toBe(participantUserId); // new generation carries it
    expect(row!.assignedToId).toBeNull(); // legacy column cannot represent non-admins

    const list = await http().get(`/api/v1/projects/${projectId}/execution/tasks`).set('Authorization', employee).expect(200);
    const listed = list.body.data.find((t: any) => t.id === task.id);
    expect(listed).toBeDefined();

    // reassignment through the update path works too
    await http().patch(`/api/v1/projects/${projectId}/execution/tasks/${task.id}`).set('Authorization', employee).send({ assignedToUserId: employeeUserId }).expect(200);
    const reassigned = await prisma.projectTask.findUnique({ where: { id: task.id } });
    expect(reassigned!.assignedToUserId).toBe(employeeUserId);
    expect(reassigned!.assignedToId).toBe(2); // admin assignee → legacy restored
  });
});
