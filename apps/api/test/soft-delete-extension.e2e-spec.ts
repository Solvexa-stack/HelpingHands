import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { actorContextStorage } from '../src/events/actor-context.storage';
import { anonymousActor } from '../src/events/actor-context';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

/**
 * W0-E4-S2 — the central soft-delete middleware, exercised per model class.
 * The flag is read per query, so this suite runs with SOFT_DELETE_ENFORCED=true
 * and restores the dark default afterwards.
 */
describe('Soft-delete Prisma middleware (W0-E4-S2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // One row of every domain model class, created in dependency order.
  let rows: Array<{ model: string; id: number }>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const block = await prisma.block.create({ data: { category: 'project' } });
    const defaultOrg = await prisma.organization.findFirst({ where: { type: 'ngo' } });
    const project = await prisma.project.create({
      data: {
        blockId: block.id,
        value: 1000,
        category: 'agricultural',
        ownerOrganizationId: defaultOrg!.id,
      },
    });
    const participant = await prisma.participant.create({
      data: { firstName: 'Soft', lastName: 'Delete' },
    });
    const donation = await prisma.projectDonation.create({
      data: {
        projectId: project.id,
        participantId: participant.id,
        amount: 10,
        qrToken: 'SoftDeleteSpecToken1234567890abc',
      },
    });
    const study = await prisma.projectStudy.create({
      data: { projectId: project.id, createdById: 1 },
    });
    const section = await prisma.studySection.create({
      data: { studyId: study.id, name: 'Section', order: 1 },
    });
    const step = await prisma.projectStep.create({
      data: { projectId: block.id, blockId: block.id },
    });
    const phase = await prisma.projectPhase.create({
      data: { projectId: block.id, blockId: block.id, order: 1 },
    });
    const task = await prisma.projectTask.create({
      data: { projectId: block.id, blockId: block.id },
    });
    const budget = await prisma.projectBudget.create({
      data: { projectId: block.id, blockId: block.id, estimatedAmount: 100 },
    });
    const expense = await prisma.projectExpense.create({
      data: { projectId: block.id, blockId: block.id, amount: 10 },
    });
    const milestone = await prisma.projectMilestone.create({
      data: { projectId: block.id, blockId: block.id },
    });
    const user = await prisma.user.create({
      data: {
        referenceId: participant.id,
        referenceType: 'participant',
        email: 'soft.delete@example.com',
      },
    });
    const admin = await prisma.admin.create({ data: { firstName: 'Soft', lastName: 'Admin' } });

    // Deletion order irrelevant: with the flag ON nothing is physically
    // removed, so Restrict constraints never fire.
    rows = [
      { model: 'projectDonation', id: donation.id },
      { model: 'studySection', id: section.id },
      { model: 'projectStudy', id: study.id },
      { model: 'projectStep', id: step.id },
      { model: 'projectTask', id: task.id },
      { model: 'projectPhase', id: phase.id },
      { model: 'projectExpense', id: expense.id },
      { model: 'projectBudget', id: budget.id },
      { model: 'projectMilestone', id: milestone.id },
      { model: 'project', id: project.id },
      { model: 'block', id: block.id },
      { model: 'user', id: user.id },
      { model: 'admin', id: admin.id },
      { model: 'participant', id: participant.id },
    ];

    process.env.SOFT_DELETE_ENFORCED = 'true';
  });

  afterAll(async () => {
    delete process.env.SOFT_DELETE_ENFORCED; // back to dark
    await app.close();
  });

  it('delete converts to an update for every domain model class; reads exclude; includeDeleted reveals', async () => {
    for (const { model, id } of rows) {
      const repo = (prisma as any)[model];

      await repo.delete({ where: { id } });

      // Row physically persists, stamped
      const revealed = await repo.findFirst({ where: { id }, includeDeleted: true });
      expect(revealed).not.toBeNull();
      expect(revealed.deletedAt).toBeInstanceOf(Date);

      // Default reads exclude it
      expect(await repo.findUnique({ where: { id } })).toBeNull();
      expect(await repo.findFirst({ where: { id } })).toBeNull();
      expect((await repo.findMany({ where: { id } })).length).toBe(0);
      expect(await repo.count({ where: { id } })).toBe(0);
    }
  });

  it('deleteMany also converts and stamps', async () => {
    const a = await prisma.admin.create({ data: { firstName: 'Bulk', lastName: 'One' } });
    const b = await prisma.admin.create({ data: { firstName: 'Bulk', lastName: 'Two' } });

    const result = await prisma.admin.deleteMany({ where: { firstName: 'Bulk' } });
    expect(result.count).toBe(2);

    const revealed = await prisma.admin.findMany({
      where: { id: { in: [a.id, b.id] } },
      includeDeleted: true,
    } as any);
    expect(revealed).toHaveLength(2);
    expect(revealed.every((r: any) => r.deletedAt !== null)).toBe(true);
  });

  it('stamps deletedBy from the ambient ActorContext', async () => {
    const admin = await prisma.admin.create({ data: { firstName: 'Stamped', lastName: 'Actor' } });

    await actorContextStorage.run(
      { actor: { ...anonymousActor('soft-delete-stamp'), userId: 42, referenceType: 'admin' } },
      // PrismaPromise is lazy — await inside the scope, as request handlers do
      async () => {
        await prisma.admin.delete({ where: { id: admin.id } });
      },
    );

    const revealed = await prisma.admin.findFirst({
      where: { id: admin.id },
      includeDeleted: true,
    } as any);
    expect(revealed!.deletedBy).toBe(42);
  });

  it('non-domain models (e.g. WebhookLog, AuditLog) are untouched by the middleware', async () => {
    const log = await prisma.webhookLog.create({
      data: { provider: 'spec', eventType: 'x', payload: {} },
    });
    await prisma.webhookLog.delete({ where: { id: log.id } });
    expect(await prisma.webhookLog.findUnique({ where: { id: log.id } })).toBeNull(); // truly gone
  });

  it('with the flag OFF the client behaves exactly as before (dark mode)', async () => {
    process.env.SOFT_DELETE_ENFORCED = 'false';
    try {
      const admin = await prisma.admin.create({ data: { firstName: 'Legacy', lastName: 'Hard' } });
      await prisma.admin.delete({ where: { id: admin.id } });
      expect(
        await prisma.admin.findFirst({ where: { id: admin.id }, includeDeleted: true } as any),
      ).toBeNull(); // physically deleted

      // And soft-deleted rows from earlier become visible again (filter is off)
      const softDeleted = await prisma.participant.findFirst({
        where: { firstName: 'Soft', lastName: 'Delete' },
      });
      expect(softDeleted).not.toBeNull();
    } finally {
      process.env.SOFT_DELETE_ENFORCED = 'true';
    }
  });
});
