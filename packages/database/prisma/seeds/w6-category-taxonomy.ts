import { PrismaClient, ProjectCategory, ProjectType } from '@prisma/client';

/**
 * W6-E2-S1/S2 — civic category taxonomy + deterministic enum→node backfill
 * (03_DATA_MODEL.md §2, 09 "adding a truth" sequence).
 *
 * The mapping rule is DATA: each node records the legacy enum value it
 * replaces (`legacyCategory` for ProjectCategory, `legacyProjectType` for
 * ProjectType). The backfill derives strictly from those columns — nothing is
 * guessed — and the gate hard-fails the seed if any project or template row
 * is left unmapped (100% coverage AC).
 *
 * Template re-key review (W6-E2-S2 AC "mapping reviewed against every
 * template row"): every legacy ProjectType has exactly one node carrying it
 * as `legacyProjectType`, so each template row's target is the reviewed
 * mapping below — agricultural→agricultural, industrial→industrial,
 * trading→trading, infrastructure→infrastructure, energy→energy,
 * housing→housing (legacy values kept as top-level nodes per the wave doc).
 */

interface NodeSeed {
  key: string;
  name: string;
  nameAr: string;
  nameFr: string;
  parent?: string;
  order: number;
  description?: string;
  legacyCategory?: ProjectCategory;
  legacyProjectType?: ProjectType;
}

export const CATEGORY_TAXONOMY: NodeSeed[] = [
  // ── Civic taxonomy ──────────────────────────────────────────────────────────
  { key: 'infrastructure', name: 'Infrastructure', nameAr: 'البنية التحتية', nameFr: 'Infrastructure', order: 1, legacyProjectType: ProjectType.infrastructure },
  { key: 'roads', name: 'Roads', nameAr: 'الطرق', nameFr: 'Routes', parent: 'infrastructure', order: 1 },
  { key: 'water', name: 'Water', nameAr: 'المياه', nameFr: 'Eau', parent: 'infrastructure', order: 2 },
  { key: 'electricity', name: 'Electricity', nameAr: 'الكهرباء', nameFr: 'Électricité', parent: 'infrastructure', order: 3 },
  { key: 'utilities', name: 'Public Utilities', nameAr: 'المرافق العامة', nameFr: 'Services publics', parent: 'infrastructure', order: 4 },

  { key: 'education', name: 'Education', nameAr: 'التعليم', nameFr: 'Éducation', order: 2 },
  { key: 'healthcare', name: 'Healthcare', nameAr: 'الرعاية الصحية', nameFr: 'Santé', order: 3 },
  { key: 'reconstruction', name: 'Reconstruction', nameAr: 'إعادة الإعمار', nameFr: 'Reconstruction', order: 4 },

  { key: 'social_support', name: 'Social Support', nameAr: 'الدعم الاجتماعي', nameFr: 'Soutien social', order: 5 },
  { key: 'martyr_families', name: 'Martyr Families', nameAr: 'أسر الشهداء', nameFr: 'Familles de martyrs', parent: 'social_support', order: 1 },
  { key: 'widows', name: 'Widows', nameAr: 'الأرامل', nameFr: 'Veuves', parent: 'social_support', order: 2 },
  { key: 'orphans', name: 'Orphans', nameAr: 'الأيتام', nameFr: 'Orphelins', parent: 'social_support', order: 3 },
  { key: 'displaced', name: 'Displaced People', nameAr: 'النازحون', nameFr: 'Personnes déplacées', parent: 'social_support', order: 4 },
  { key: 'refugees_idps', name: 'Refugees & IDPs', nameAr: 'اللاجئون والنازحون داخلياً', nameFr: 'Réfugiés et déplacés internes', parent: 'social_support', order: 5 },

  { key: 'emergency_relief', name: 'Emergency Relief', nameAr: 'الإغاثة الطارئة', nameFr: 'Secours d’urgence', order: 6 },
  { key: 'salaries_and_aid', name: 'Salaries & Aid', nameAr: 'الرواتب والمساعدات', nameFr: 'Salaires et aides', order: 7 },

  // ── Legacy values kept as nodes (compatibility; wave doc rule) ─────────────
  { key: 'agricultural', name: 'Agricultural', nameAr: 'زراعي', nameFr: 'Agricole', order: 8, legacyCategory: ProjectCategory.agricultural, legacyProjectType: ProjectType.agricultural },
  { key: 'industrial', name: 'Industrial', nameAr: 'صناعي', nameFr: 'Industriel', order: 9, legacyCategory: ProjectCategory.industrial, legacyProjectType: ProjectType.industrial },
  { key: 'trading', name: 'Trading', nameAr: 'تجاري', nameFr: 'Commercial', order: 10, legacyCategory: ProjectCategory.trading, legacyProjectType: ProjectType.trading },
  { key: 'energy', name: 'Energy', nameAr: 'الطاقة', nameFr: 'Énergie', order: 11, legacyProjectType: ProjectType.energy },
  { key: 'housing', name: 'Housing', nameAr: 'الإسكان', nameFr: 'Logement', order: 12, legacyProjectType: ProjectType.housing },
];

/** Civic study template sets (W6-E2-S2): emergency relief, with i18n. The
 *  infrastructure civic set is the re-keyed legacy infrastructure set. */
const EMERGENCY_RELIEF_TEMPLATES = [
  { name: 'Needs Assessment', nameAr: 'تقييم الاحتياجات', nameFr: 'Évaluation des besoins', description: 'Scope and urgency of the emergency; affected population', order: 1 },
  { name: 'Beneficiary Targeting', nameAr: 'تحديد المستفيدين', nameFr: 'Ciblage des bénéficiaires', description: 'Eligibility criteria and beneficiary registration plan', order: 2 },
  { name: 'Logistics & Distribution', nameAr: 'اللوجستيات والتوزيع', nameFr: 'Logistique et distribution', description: 'Procurement, transport, and distribution plan', order: 3 },
  { name: 'Relief Budget', nameAr: 'ميزانية الإغاثة', nameFr: 'Budget de secours', description: 'Cost breakdown and funding sources for the response', order: 4 },
];

export interface CategoryBackfillResult {
  nodesSeeded: number;
  projectsBackfilled: number;
  templatesRekeyed: number;
  civicTemplatesCreated: number;
  gate: { projectsUnmapped: number; templatesUnmapped: number };
}

export async function seedCategoryTaxonomy(prisma: PrismaClient): Promise<CategoryBackfillResult> {
  // ── Nodes (idempotent by key; names/order are updatable data) ──────────────
  const idByKey = new Map<string, number>();
  for (const node of CATEGORY_TAXONOMY) {
    const parentId = node.parent ? idByKey.get(node.parent) ?? null : null;
    if (node.parent && parentId == null) {
      throw new Error(`W6 taxonomy: parent "${node.parent}" of "${node.key}" must be seeded first`);
    }
    const row = await prisma.projectCategoryNode.upsert({
      where: { key: node.key },
      create: {
        key: node.key,
        parentId,
        name: node.name,
        nameAr: node.nameAr,
        nameFr: node.nameFr,
        description: node.description,
        order: node.order,
        legacyCategory: node.legacyCategory,
        legacyProjectType: node.legacyProjectType,
      },
      update: {
        parentId,
        name: node.name,
        nameAr: node.nameAr,
        nameFr: node.nameFr,
        order: node.order,
        legacyCategory: node.legacyCategory ?? null,
        legacyProjectType: node.legacyProjectType ?? null,
      },
    });
    idByKey.set(node.key, row.id);
  }

  // ── Project backfill: enum → node via the recorded mapping ────────────────
  const categoryNodes = await prisma.projectCategoryNode.findMany({
    where: { legacyCategory: { not: null } },
  });
  let projectsBackfilled = 0;
  for (const node of categoryNodes) {
    const result = await prisma.project.updateMany({
      where: { categoryId: null, category: node.legacyCategory },
      data: { categoryId: node.id },
    });
    projectsBackfilled += result.count;
  }

  // ── Template re-key: every row's projectType → its node ───────────────────
  const typeNodes = await prisma.projectCategoryNode.findMany({
    where: { legacyProjectType: { not: null } },
  });
  let templatesRekeyed = 0;
  for (const node of typeNodes) {
    const result = await prisma.studyDepartmentTemplate.updateMany({
      where: { categoryNodeId: null, projectType: node.legacyProjectType },
      data: { categoryNodeId: node.id },
    });
    templatesRekeyed += result.count;
  }

  // ── Civic template sets (idempotent: skipped once the node has templates) ──
  let civicTemplatesCreated = 0;
  const emergencyNodeId = idByKey.get('emergency_relief')!;
  const existingEmergency = await prisma.studyDepartmentTemplate.count({
    where: { categoryNodeId: emergencyNodeId },
  });
  if (existingEmergency === 0) {
    const created = await prisma.studyDepartmentTemplate.createMany({
      data: EMERGENCY_RELIEF_TEMPLATES.map((t) => ({
        categoryNodeId: emergencyNodeId,
        name: t.name,
        nameAr: t.nameAr,
        nameFr: t.nameFr,
        description: t.description,
        isRequired: true,
        order: t.order,
        isActive: true,
      })),
    });
    civicTemplatesCreated = created.count;
  }

  // ── The gate: 100% coverage or the seed fails (W6-E2-S1 AC) ───────────────
  const projectsUnmapped = await prisma.project.count({ where: { categoryId: null } });
  const templatesUnmapped = await prisma.studyDepartmentTemplate.count({
    where: { categoryNodeId: null },
  });
  if (projectsUnmapped > 0 || templatesUnmapped > 0) {
    throw new Error(
      `W6 category gate failed: ${projectsUnmapped} projects and ${templatesUnmapped} templates carry no category node`,
    );
  }

  return {
    nodesSeeded: CATEGORY_TAXONOMY.length,
    projectsBackfilled,
    templatesRekeyed,
    civicTemplatesCreated,
    gate: { projectsUnmapped, templatesUnmapped },
  };
}
