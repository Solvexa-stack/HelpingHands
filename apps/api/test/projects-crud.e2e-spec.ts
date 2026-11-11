import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { authHeaderFor } from './utils/auth';
import { createProjectViaApi, createBlockViaApi } from './utils/fixtures';

/**
 * Projects CRUD + the delete dependency guard.
 *
 * Regression context: DELETE /projects/:id used to delete the project's
 * workflow instance first and then call prisma.project.delete OUTSIDE a
 * transaction. When a Restrict relation (study, donation, fund allocation,
 * expense, …) still pointed at the project, the delete raised a raw Prisma
 * P2003 (a bare 500) AND the workflow instance was already gone. The fix
 * screens for dependents up front (→ 409) and wraps the cleanup + delete in a
 * single transaction, so a refused delete leaves everything intact.
 */

// A 1×1 transparent PNG — enough for the upload path to accept a real image.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

const subjectKey = (projectId: number) => ({
  subjectType_subjectId: { subjectType: 'project', subjectId: projectId },
});

describe('Projects CRUD + delete dependency guard', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    admin = await authHeaderFor(prisma, 'administrator');
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a project with no cover image', async () => {
    const { projectId, blockId } = await createProjectViaApi(app, admin, 'no-image');

    const coverCount = await prisma.file.count({
      where: { referenceId: blockId, referenceType: 'block', isCover: true },
    });
    expect(coverCount).toBe(0);

    const res = await http().get(`/api/v1/projects/${projectId}`).expect(200);
    expect(res.body.data.id).toBe(projectId);
  });

  it('creates a project with a cover image (uploaded file becomes the cover)', async () => {
    const blockId = await createBlockViaApi(app, admin, 'with-image');

    const upload = await http()
      .post('/api/v1/files/upload')
      .set('Authorization', admin)
      .field('referenceId', String(blockId))
      .field('referenceType', 'block')
      .field('fileType', 'image')
      .field('isCover', 'true')
      .attach('file', PNG_1x1, 'cover.png')
      .expect(201);
    expect(upload.body.data.isCover).toBe(true);

    const projRes = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 1000, category: 'agricultural' })
      .expect(201);
    expect(projRes.body.data.blockId).toBe(blockId);

    const cover = await prisma.file.findFirst({
      where: { referenceId: blockId, referenceType: 'block', isCover: true },
    });
    expect(cover).not.toBeNull();
    expect(cover!.url).toMatch(/\/uploads\//);
  });

  it('soft-deletes a project (a study no longer blocks it), hiding it while keeping the workflow instance', async () => {
    const { projectId, blockId } = await createProjectViaApi(app, admin, 'deletable');
    // A feasibility study used to make deletion impossible; it must not now.
    await http().post('/api/v1/study').set('Authorization', admin).send({ projectId }).expect(201);

    const instanceBefore = await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) });
    expect(instanceBefore).not.toBeNull();

    await http().delete(`/api/v1/projects/${projectId}`).set('Authorization', admin).expect(200);

    // Row is kept but stamped deleted (reads below use raw prisma; the
    // soft-delete middleware is dark in the test baseline).
    const row = await prisma.project.findUnique({ where: { id: projectId } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();

    // Its study and content block are soft-deleted too.
    expect((await prisma.projectStudy.findUnique({ where: { projectId } }))!.deletedAt).not.toBeNull();
    expect((await prisma.block.findUnique({ where: { id: blockId } }))!.deletedAt).not.toBeNull();

    // The workflow instance and its logs are kept.
    const instanceAfter = await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) });
    expect(instanceAfter).not.toBeNull();
    expect(instanceAfter!.id).toBe(instanceBefore!.id);

    // Hidden from the detail endpoint and the public list.
    await http().get(`/api/v1/projects/${projectId}`).expect(404);
    const list = await http().get('/api/v1/projects?limit=100').expect(200);
    expect((list.body.data.data as any[]).some((p) => p.id === projectId)).toBe(false);
  });

  it('refuses to soft-delete a project with a confirmed donation (409) and leaves it visible', async () => {
    const { projectId } = await createProjectViaApi(app, admin, 'guarded');

    const participant = await prisma.participant.create({ data: { firstName: 'Conf', lastName: 'Donor' } });
    await prisma.projectDonation.create({
      data: {
        projectId,
        participantId: participant.id,
        amount: 100,
        status: 'approved',
        qrToken: 'ProjectsCrudConfirmedDonationToken01',
      },
    });

    const res = await http()
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .expect(409);
    expect(res.body.code).toBe('PROJECT_HAS_DEPENDENTS');
    expect(res.body.details.blockers).toEqual(
      expect.arrayContaining([{ type: 'confirmedDonations', count: 1 }]),
    );

    // Still present and NOT soft-deleted.
    const row = await prisma.project.findUnique({ where: { id: projectId } });
    expect(row!.deletedAt).toBeNull();
    await http().get(`/api/v1/projects/${projectId}`).expect(200);
  });

  it('frees the slug of a soft-deleted project so a new project can reuse it', async () => {
    const slug = 'reusable-slug-crud-spec';
    const firstBlock = await http()
      .post('/api/v1/blocks')
      .set('Authorization', admin)
      .send({
        category: 'project',
        translations: [{ languageCode: 'en', name: 'Reusable', slug, brief: 'b', description: 'd' }],
      })
      .expect(201);
    const firstProject = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId: firstBlock.body.data.id, value: 1000, category: 'agricultural' })
      .expect(201);

    // Before deletion the slug is taken.
    await http()
      .post('/api/v1/blocks')
      .set('Authorization', admin)
      .send({ category: 'project', translations: [{ languageCode: 'en', name: 'Dup', slug, brief: 'b', description: 'd' }] })
      .expect(409);

    await http().delete(`/api/v1/projects/${firstProject.body.data.id}`).set('Authorization', admin).expect(200);

    // After the soft delete the slug is free again.
    await http()
      .post('/api/v1/blocks')
      .set('Authorization', admin)
      .send({ category: 'project', translations: [{ languageCode: 'en', name: 'Reuse', slug, brief: 'b', description: 'd' }] })
      .expect(201);
  });
});
