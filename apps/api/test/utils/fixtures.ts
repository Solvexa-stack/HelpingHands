import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Creates a content block through the real API. Blocks carry the name/
 * description translations for projects and for every execution/financial
 * entity (phases, tasks, budgets, … — the D1 pattern).
 * `authHeader` must belong to an administrator or employee.
 */
export async function createBlockViaApi(
  app: INestApplication,
  authHeader: string,
  slug: string,
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/blocks')
    .set('Authorization', authHeader)
    .send({
      category: 'project',
      translations: [
        {
          languageCode: 'en',
          name: `E2E ${slug}`,
          slug: `e2e-${slug}`,
          brief: 'E2E fixture',
          description: 'Block created by the regression suite',
        },
      ],
    })
    .expect(201);

  return res.body.data.id;
}

/**
 * Creates a block + project pair through the real API (projects are 1:1 with
 * content blocks). `authHeader` must belong to an administrator or employee.
 */
export async function createProjectViaApi(
  app: INestApplication,
  authHeader: string,
  slug: string,
  options: { value?: number; category?: string } = {},
): Promise<{ blockId: number; projectId: number }> {
  const blockId = await createBlockViaApi(app, authHeader, `project-${slug}`);

  const projectRes = await request(app.getHttpServer())
    .post('/api/v1/projects')
    .set('Authorization', authHeader)
    .send({
      blockId,
      value: options.value ?? 50000,
      category: options.category ?? 'agricultural',
    })
    .expect(201);

  return { blockId, projectId: projectRes.body.data.id };
}
