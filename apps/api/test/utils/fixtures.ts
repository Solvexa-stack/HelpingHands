import { INestApplication } from '@nestjs/common';
import request from 'supertest';

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
  const blockRes = await request(app.getHttpServer())
    .post('/api/v1/blocks')
    .set('Authorization', authHeader)
    .send({
      category: 'project',
      translations: [
        {
          languageCode: 'en',
          name: `E2E project ${slug}`,
          slug: `e2e-project-${slug}`,
          brief: 'E2E fixture',
          description: 'Project created by the regression suite',
        },
      ],
    })
    .expect(201);

  const projectRes = await request(app.getHttpServer())
    .post('/api/v1/projects')
    .set('Authorization', authHeader)
    .send({
      blockId: blockRes.body.data.id,
      value: options.value ?? 50000,
      category: options.category ?? 'agricultural',
    })
    .expect(201);

  return { blockId: blockRes.body.data.id, projectId: projectRes.body.data.id };
}
