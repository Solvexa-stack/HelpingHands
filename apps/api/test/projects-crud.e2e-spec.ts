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

  it('deletes a project with no dependents and removes its workflow instance', async () => {
    const { projectId } = await createProjectViaApi(app, admin, 'deletable');

    const before = await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) });
    expect(before).not.toBeNull();

    await http().delete(`/api/v1/projects/${projectId}`).set('Authorization', admin).expect(200);

    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();
    expect(await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) })).toBeNull();
  });

  it('refuses to delete a project with dependents (409) and leaves it AND its workflow instance intact', async () => {
    const { projectId } = await createProjectViaApi(app, admin, 'guarded');

    // A ProjectStudy is an onDelete: Restrict dependent.
    await http().post('/api/v1/study').set('Authorization', admin).send({ projectId }).expect(201);

    const instanceBefore = await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) });
    expect(instanceBefore).not.toBeNull();

    const res = await http()
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', admin)
      .expect(409);
    // Machine-readable code + structured blockers so the client localizes itself.
    expect(res.body.code).toBe('PROJECT_HAS_DEPENDENTS');
    expect(res.body.details.blockers).toEqual(
      expect.arrayContaining([{ type: 'study', count: 1 }]),
    );
    // English fallback message still present for non-admin consumers.
    expect(res.body.message).toMatch(/cannot be deleted/i);

    // The project survives.
    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull();
    // The study survives (never cascade-deleted).
    expect(await prisma.projectStudy.findUnique({ where: { projectId } })).not.toBeNull();
    // The workflow instance survives — the bug this test guards against.
    const instanceAfter = await prisma.workflowInstance.findUnique({ where: subjectKey(projectId) });
    expect(instanceAfter).not.toBeNull();
    expect(instanceAfter!.id).toBe(instanceBefore!.id);
  });
});
