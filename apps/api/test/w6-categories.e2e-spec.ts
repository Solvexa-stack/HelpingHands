import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { createBlockViaApi, createProjectViaApi } from './utils/fixtures';

/**
 * W6-E2 — civic category taxonomy: the hierarchical tree with i18n names,
 * 100% categoryId coverage after the seed gate, template generation from
 * category nodes (child nodes inherit the nearest ancestor's set), the legacy
 * template regression, and the enum freeze (both legacy enums unwritten-to).
 */
describe('Category taxonomy (W6-E2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    process.env.TENANCY_ENFORCED = 'true';
    process.env.POLICY_ENFORCED = 'true';
    process.env.WORKFLOW_ENFORCED = 'true';
    admin = await authHeaderFor(prisma, 'administrator');
  }, 120_000);

  afterAll(async () => {
    delete process.env.TENANCY_ENFORCED;
    delete process.env.POLICY_ENFORCED;
    delete process.env.WORKFLOW_ENFORCED;
    await app.close();
  });

  it('serves the civic taxonomy as a tree with names in all three locales', async () => {
    const res = await http().get('/api/v1/categories').expect(200);
    const roots = res.body.data as Array<{ key: string; name: string; nameAr: string; nameFr: string; children: any[] }>;

    const keys = roots.map((r) => r.key);
    for (const expected of ['infrastructure', 'education', 'healthcare', 'reconstruction', 'social_support', 'emergency_relief', 'salaries_and_aid', 'agricultural', 'industrial', 'trading']) {
      expect(keys).toContain(expected);
    }

    const social = roots.find((r) => r.key === 'social_support')!;
    expect(social.children.map((c: { key: string }) => c.key).sort()).toEqual(
      ['displaced', 'martyr_families', 'orphans', 'refugees_idps', 'widows'],
    );
    const infrastructure = roots.find((r) => r.key === 'infrastructure')!;
    expect(infrastructure.children.map((c: { key: string }) => c.key).sort()).toEqual(
      ['electricity', 'roads', 'utilities', 'water'],
    );

    // locale-aware labels (W6-E2-S3 AC: three locales)
    expect(social.name).toBe('Social Support');
    expect(social.nameAr).toBe('الدعم الاجتماعي');
    expect(social.nameFr).toBe('Soutien social');
  });

  it('the backfill gate held: every project and template carries its node', async () => {
    expect(await prisma.project.count({ where: { categoryId: null } })).toBe(0);
    expect(await prisma.studyDepartmentTemplate.count({ where: { categoryNodeId: null } })).toBe(0);
  });

  it('a legacy-category create resolves to the node and leaves the frozen enum null', async () => {
    const { projectId } = await createProjectViaApi(app, admin, 'w6-legacy-cat', { category: 'agricultural' });
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { categoryNode: true },
    });
    expect(project!.categoryNode!.key).toBe('agricultural');
    expect(project!.category).toBeNull(); // W6-E2-S1 AC: enum unwritten-to
  });

  it('creates a civic-category project by key and filters hierarchically', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-water');
    const created = await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 80000, categoryKey: 'water' })
      .expect(201);
    const projectId = created.body.data.id;
    expect(created.body.data.categoryNode.key).toBe('water');

    const ids = async (url: string) => {
      const res = await http().get(url).expect(200);
      return (res.body.data.data as Array<{ id: number }>).map((p) => p.id);
    };
    // parent key matches the child project (node + descendants)
    expect(await ids('/api/v1/projects?categoryKey=infrastructure&limit=100')).toContain(projectId);
    // sibling civic key does not
    expect(await ids('/api/v1/projects?categoryKey=education&limit=100')).not.toContain(projectId);
    // the legacy enum filter still works, routed through the taxonomy
    const legacyIds = await ids('/api/v1/projects?category=agricultural&limit=100');
    expect(legacyIds.length).toBeGreaterThan(0);
    expect(legacyIds).not.toContain(projectId);
  });

  it('template generation: a civic child node inherits the infrastructure study set', async () => {
    const water = await prisma.project.findFirst({
      where: { categoryNode: { key: 'water' } },
      orderBy: { id: 'desc' },
    });
    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', admin)
      .send({ projectId: water!.id, summary: 'W6 civic study' })
      .expect(201);

    const names = study.body.data.sections.map((s: { name: string }) => s.name);
    expect(names).toContain('Engineering Study'); // infrastructure set, inherited by water
    expect(names).toContain('Ground Survey');
    expect(names).toContain('Financial Overview'); // shared sections re-keyed with the set
    expect(names).toHaveLength(11); // 7 infrastructure + 4 shared — the full legacy set
  });

  it('template regression: a legacy category still generates its exact section set', async () => {
    const { projectId } = await createProjectViaApi(app, admin, 'w6-agri-regression', { category: 'agricultural' });
    const study = await http()
      .post('/api/v1/study')
      .set('Authorization', admin)
      .send({ projectId, summary: 'regression study' })
      .expect(201);
    const names = study.body.data.sections.map((s: { name: string }) => s.name);
    expect(names).toContain('Soil Study');
    expect(names).toContain('Crop Planning');
    expect(names).toHaveLength(11); // 7 agricultural + 4 shared, exactly as before W6
  });

  it('the emergency_relief civic set was authored with i18n', async () => {
    const node = await prisma.projectCategoryNode.findUnique({ where: { key: 'emergency_relief' } });
    const templates = await prisma.studyDepartmentTemplate.findMany({
      where: { categoryNodeId: node!.id },
      orderBy: { order: 'asc' },
    });
    expect(templates.map((t) => t.name)).toEqual([
      'Needs Assessment',
      'Beneficiary Targeting',
      'Logistics & Distribution',
      'Relief Budget',
    ]);
    expect(templates.every((t) => t.nameAr && t.nameFr)).toBe(true);
    expect(templates.every((t) => t.projectType === null)).toBe(true); // civic rows never touch the frozen enum
  });

  it('the freeze middleware blocks writes to both legacy enum columns', async () => {
    const anyProject = await prisma.project.findFirst({});
    await expect(
      prisma.project.update({ where: { id: anyProject!.id }, data: { category: 'trading' } as never }),
    ).rejects.toThrow(/frozen/);

    const anyTemplate = await prisma.studyDepartmentTemplate.findFirst({});
    await expect(
      prisma.studyDepartmentTemplate.update({
        where: { id: anyTemplate!.id },
        data: { projectType: 'trading' } as never,
      }),
    ).rejects.toThrow(/frozen/);
  });

  it('a project create without any category input is rejected', async () => {
    const blockId = await createBlockViaApi(app, admin, 'w6-nocat');
    await http()
      .post('/api/v1/projects')
      .set('Authorization', admin)
      .send({ blockId, value: 1000 })
      .expect(400);
  });
});
