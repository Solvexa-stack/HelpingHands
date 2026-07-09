import { PrismaClient, AdminRole, BlockCategory, ProjectCategory, Representation, ProjectType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { backfillIdentity } from './backfills/w1-identity-backfill';
import { backfillGovernance } from './backfills/w3-governance-backfill';
import { seedWorkflowDefinitions } from './seeds/w4-workflow-definitions';
import { backfillWorkflowInstances } from './backfills/w4-workflow-backfill';
import { backfillTreasury } from './backfills/w5-treasury-backfill';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Languages ──────────────────────────────────────────────────────────────
  const languages = await Promise.all([
    prisma.language.upsert({
      where: { code: 'en' },
      update: {},
      create: { name: 'English', code: 'en', flagCode: 'us', direction: 'ltr', order: 0, isActive: true },
    }),
    prisma.language.upsert({
      where: { code: 'ar' },
      update: {},
      create: { name: 'العربية', code: 'ar', flagCode: 'sa', direction: 'rtl', order: 1, isActive: true },
    }),
    prisma.language.upsert({
      where: { code: 'fr' },
      update: {},
      create: { name: 'Français', code: 'fr', flagCode: 'fr', direction: 'ltr', order: 2, isActive: true },
    }),
  ]);
  console.log(`✅ Created ${languages.length} languages`);

  // ─── Admin (Administrator) ──────────────────────────────────────────────────
  const adminPerson = await prisma.admin.upsert({
    where: { id: 1 },
    update: {},
    create: { firstName: 'System', lastName: 'Administrator', role: AdminRole.administrator },
  });

  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  await prisma.user.upsert({
    where: { email: 'admin@helpinghands.org' },
    update: {},
    create: {
      referenceId: adminPerson.id,
      referenceType: 'admin',
      email: 'admin@helpinghands.org',
      password: adminPassword,
      isActive: true,
      joiningDate: new Date(),
    },
  });
  console.log('✅ Created administrator account (admin@helpinghands.org / Admin@123456)');

  // ─── Employee ────────────────────────────────────────────────────────────────
  const employeePerson = await prisma.admin.upsert({
    where: { id: 2 },
    update: {},
    create: { firstName: 'John', lastName: 'Employee', role: AdminRole.employee },
  });

  const empPassword = await bcrypt.hash('Employee@123', 12);
  await prisma.user.upsert({
    where: { email: 'employee@helpinghands.org' },
    update: {},
    create: {
      referenceId: employeePerson.id,
      referenceType: 'admin',
      email: 'employee@helpinghands.org',
      password: empPassword,
      isActive: true,
      joiningDate: new Date(),
    },
  });
  console.log('✅ Created employee account (employee@helpinghands.org / Employee@123)');

  // ─── Financial Officer ────────────────────────────────────────────────────────
  const foPerson = await prisma.admin.upsert({
    where: { id: 3 },
    update: {},
    create: { firstName: 'Jane', lastName: 'Financial', role: AdminRole.financial_officer },
  });

  const foPassword = await bcrypt.hash('Officer@123', 12);
  await prisma.user.upsert({
    where: { email: 'officer@helpinghands.org' },
    update: {},
    create: {
      referenceId: foPerson.id,
      referenceType: 'admin',
      email: 'officer@helpinghands.org',
      password: foPassword,
      isActive: true,
      joiningDate: new Date(),
    },
  });
  console.log('✅ Created financial officer account (officer@helpinghands.org / Officer@123)');

  // ─── Sample Participant ───────────────────────────────────────────────────────
  const participant = await prisma.participant.upsert({
    where: { id: 1 },
    update: {},
    create: { firstName: 'Ali', lastName: 'Hassan', representation: Representation.personal },
  });

  const partPassword = await bcrypt.hash('Participant@123', 12);
  await prisma.user.upsert({
    where: { email: 'participant@example.com' },
    update: {},
    create: {
      referenceId: participant.id,
      referenceType: 'participant',
      email: 'participant@example.com',
      password: partPassword,
      isActive: true,
      joiningDate: new Date(),
    },
  });
  console.log('✅ Created participant account (participant@example.com / Participant@123)');

  // ─── Sample Project ───────────────────────────────────────────────────────────
  const existingProjectBlock = await prisma.blockTranslation.findFirst({
    where: { slug: 'community-water-well-project' },
    select: { blockId: true },
  });

  let block: { id: number };
  if (existingProjectBlock) {
    block = { id: existingProjectBlock.blockId };
  } else {
    block = await prisma.block.create({
      data: {
        category: BlockCategory.project,
        isActive: true,
        translations: {
          create: [
            {
              languageCode: 'en',
              name: 'Community Water Well Project',
              slug: 'community-water-well-project',
              brief: 'Providing clean water access to rural communities',
              description:
                'This project aims to drill and install a solar-powered water well serving over 500 families in the remote region, ensuring year-round access to clean, safe drinking water.',
            },
            {
              languageCode: 'ar',
              name: 'مشروع بئر مياه المجتمع',
              slug: 'mashrou3-bi2r-miyah-almojtama3',
              brief: 'توفير مياه نظيفة للمجتمعات الريفية',
              description:
                'يهدف هذا المشروع إلى حفر وتركيب بئر مياه يعمل بالطاقة الشمسية لخدمة أكثر من 500 أسرة في المنطقة النائية.',
            },
          ],
        },
      },
    });
  }

  // ─── Organizations (W1-E3) ────────────────────────────────────────────────────
  let defaultOrg = await prisma.organization.findFirst({
    where: { type: 'ngo', name: 'HelpingHands' },
  });
  if (!defaultOrg) {
    defaultOrg = await prisma.organization.create({
      data: {
        type: 'ngo',
        name: 'HelpingHands',
        status: 'active',
        capabilities: {
          canExecuteProjects: true,
          canReceivePublicFunds: true,
          canOpenDonations: true,
          isGovernmentEntity: false,
          requiresBoardOversight: false,
        },
      },
    });
  }
  const boardOrg = await prisma.organization.findFirst({
    where: { type: 'board', name: 'HelpingHands Board' },
  });
  if (!boardOrg) {
    await prisma.organization.create({
      data: {
        type: 'board',
        name: 'HelpingHands Board',
        status: 'active',
        capabilities: {
          canExecuteProjects: false,
          canReceivePublicFunds: false,
          canOpenDonations: false,
          isGovernmentEntity: false,
          requiresBoardOversight: false,
        },
      },
    });
  }
  console.log('✅ Created default + board organizations');

  await prisma.project.upsert({
    where: { blockId: block.id },
    update: {},
    create: {
      blockId: block.id,
      location: 'Rural District, South Region',
      value: 50000.0,
      progression: 0,
      isCompleted: false,
      category: ProjectCategory.agricultural,
      expectedStartDate: new Date('2024-03-01'),
      financialOfficerId: foPerson.id,
      ownerOrganizationId: defaultOrg.id,
    },
  });
  console.log('✅ Created sample project');

  // ─── About Us Block ────────────────────────────────────────────────────────────
  const existingAboutBlock = await prisma.blockTranslation.findFirst({
    where: { slug: 'our-mission' },
  });

  if (!existingAboutBlock) {
    await prisma.block.create({
      data: {
        category: BlockCategory.about_us,
        isActive: true,
        orderId: 0,
        translations: {
          create: [
            {
              languageCode: 'en',
              name: 'Our Mission',
              slug: 'our-mission',
              brief: 'Building bridges between compassion and action',
              description:
                'HelpingHands is a community-driven platform connecting generous donors with impactful projects worldwide. We believe in transparent, direct impact where every contribution is tracked and verified.',
            },
            {
              languageCode: 'ar',
              name: 'مهمتنا',
              slug: 'our-mission-ar',
              brief: 'بناء جسور بين الرحمة والعمل',
              description:
                'هيلبينج هاندز هي منصة مجتمعية تربط المانحين الكرماء بالمشاريع المؤثرة في جميع أنحاء العالم.',
            },
          ],
        },
      },
    });
  }
  console.log('✅ Created about us content');

  // ─── W1 identity backfill (memberships + grants, idempotent) ─────────────────
  const backfill = await backfillIdentity(prisma);
  console.log(`✅ Identity backfill (${backfill.membershipsCreated} memberships, ${backfill.grantsCreated} grants)`);

  // ─── W3 governance backfill (rounds/votes + legacy decisions, idempotent) ────
  const governance = await backfillGovernance(prisma);
  if (governance.verification.mismatches.length > 0) {
    throw new Error(`W3 governance backfill verification failed: ${governance.verification.mismatches.join('; ')}`);
  }
  console.log(`✅ Governance backfill (${governance.roundsCreated} rounds, ${governance.votesCopied} votes, ${governance.decisionsCreated} decisions; tallies verified)`);

  // ─── W4 workflow definitions + instance backfill (idempotent) ───────────────
  const definitions = await seedWorkflowDefinitions(prisma);
  const workflow = await backfillWorkflowInstances(prisma);
  if (workflow.verification.mismatches.length > 0) {
    throw new Error(`W4 workflow backfill verification failed: ${workflow.verification.mismatches.join('; ')}`);
  }
  console.log(`✅ Workflow engine (${definitions.seeded} definitions; ${workflow.instancesCreated} instances backfilled; census ${workflow.census.length} combos mapped; derivation verified)`);

  // ─── W5 initial funds (Board-created; launch ceiling threshold=0) ──────────
  const initialFunds = ['Development & Infrastructure', 'Social Support', 'Relief & Emergency'];
  let fundsCreated = 0;
  for (const name of initialFunds) {
    const existing = await prisma.fund.findFirst({ where: { name } });
    if (!existing) {
      await prisma.fund.create({ data: { name, policy: { dualApprovalThreshold: 0 } } });
      fundsCreated += 1;
    }
  }

  // ─── W5 treasury backfill: accounts + ledger reconstruction + gate ─────────
  const treasury = await backfillTreasury(prisma);
  if (treasury.reconciliation.mismatches.length > 0) {
    throw new Error(`W5 reconciliation gate failed: ${treasury.reconciliation.mismatches.join('; ')}`);
  }
  console.log(`✅ Treasury (${fundsCreated} funds created; ${treasury.accountsCreated} accounts; ${treasury.transactionsReconstructed} legacy rows reconstructed; reconciliation exact for ${treasury.reconciliation.projectsChecked} projects)`);

  // ─── Study Department Templates ───────────────────────────────────────────────
  const sharedSections = [
    { name: 'Financial Overview', description: 'Overall budget breakdown and funding sources', order: 100 },
    { name: 'Legal Compliance', description: 'Regulatory requirements and permits needed', order: 101 },
    { name: 'Social Impact Assessment', description: 'Expected social benefits and affected communities', order: 102 },
    { name: 'Project Timeline', description: 'Milestones, phases, and delivery schedule', order: 103 },
  ];

  const templatesByType: Array<{ projectType: ProjectType; name: string; description?: string; order: number }> = [
    // Agricultural
    { projectType: ProjectType.agricultural, name: 'Soil Study', description: 'Analysis of soil quality, composition, and suitability for farming', order: 1 },
    { projectType: ProjectType.agricultural, name: 'Water Access', description: 'Availability of irrigation and water sources', order: 2 },
    { projectType: ProjectType.agricultural, name: 'Crop Planning', description: 'Recommended crops based on climate and market demand', order: 3 },
    { projectType: ProjectType.agricultural, name: 'Climate & Season', description: 'Seasonal patterns and climate risk factors', order: 4 },
    { projectType: ProjectType.agricultural, name: 'Financial Estimate', description: 'Input costs, expected yield, and profit projections', order: 5 },
    { projectType: ProjectType.agricultural, name: 'Legal & Land', description: 'Land ownership, usage rights, and agricultural regulations', order: 6 },
    { projectType: ProjectType.agricultural, name: 'Community Impact', description: 'Effect on local farmers and food security', order: 7 },
    ...sharedSections.map(s => ({ projectType: ProjectType.agricultural, ...s })),

    // Industrial
    { projectType: ProjectType.industrial, name: 'Technical Design', description: 'Engineering specifications and facility layout', order: 1 },
    { projectType: ProjectType.industrial, name: 'Environmental Study', description: 'Pollution impact and environmental mitigation plan', order: 2 },
    { projectType: ProjectType.industrial, name: 'Safety & Risk', description: 'Occupational hazards and risk management protocols', order: 3 },
    { projectType: ProjectType.industrial, name: 'Supply Chain', description: 'Raw material sourcing and logistics plan', order: 4 },
    { projectType: ProjectType.industrial, name: 'Budget & ROI', description: 'Capital expenditure and return on investment analysis', order: 5 },
    { projectType: ProjectType.industrial, name: 'Legal Permits', description: 'Industry-specific licenses and zoning approvals', order: 6 },
    { projectType: ProjectType.industrial, name: 'Job Creation Report', description: 'Number of jobs created and workforce training needs', order: 7 },
    ...sharedSections.map(s => ({ projectType: ProjectType.industrial, ...s })),

    // Infrastructure
    { projectType: ProjectType.infrastructure, name: 'Engineering Study', description: 'Structural and civil engineering assessment', order: 1 },
    { projectType: ProjectType.infrastructure, name: 'Ground Survey', description: 'Topographic and geotechnical survey results', order: 2 },
    { projectType: ProjectType.infrastructure, name: 'Disaster Resilience', description: 'Earthquake, flood, and extreme weather resistance', order: 3 },
    { projectType: ProjectType.infrastructure, name: 'Maintenance Plan', description: 'Long-term upkeep schedule and associated costs', order: 4 },
    { projectType: ProjectType.infrastructure, name: 'Cost & Funding', description: 'Construction budget and funding breakdown', order: 5 },
    { projectType: ProjectType.infrastructure, name: 'Affected Population', description: 'Number and demographics of beneficiaries', order: 6 },
    { projectType: ProjectType.infrastructure, name: 'Reconstruction Priority', description: 'Urgency scoring and prioritization rationale', order: 7 },
    ...sharedSections.map(s => ({ projectType: ProjectType.infrastructure, ...s })),

    // Energy
    { projectType: ProjectType.energy, name: 'Power Demand Study', description: 'Current and projected energy demand in the area', order: 1 },
    { projectType: ProjectType.energy, name: 'Technology Choice', description: 'Evaluation of solar, wind, hydro, or other sources', order: 2 },
    { projectType: ProjectType.energy, name: 'Grid Connection', description: 'Integration plan with existing power infrastructure', order: 3 },
    { projectType: ProjectType.energy, name: 'Storage & Distribution', description: 'Battery storage and power distribution architecture', order: 4 },
    { projectType: ProjectType.energy, name: 'Environmental Assessment', description: 'Ecological impact of the energy installation', order: 5 },
    { projectType: ProjectType.energy, name: 'Cost per kWh', description: 'Levelized cost of energy and pricing model', order: 6 },
    { projectType: ProjectType.energy, name: 'Operator Training', description: 'Training plan for local staff to operate and maintain the system', order: 7 },
    ...sharedSections.map(s => ({ projectType: ProjectType.energy, ...s })),

    // Housing
    { projectType: ProjectType.housing, name: 'Structural Design', description: 'Architectural plans and structural engineering details', order: 1 },
    { projectType: ProjectType.housing, name: 'Land Ownership', description: 'Verification of land title and usage rights', order: 2 },
    { projectType: ProjectType.housing, name: 'Beneficiary List', description: 'Identified families and eligibility criteria', order: 3 },
    { projectType: ProjectType.housing, name: 'Material Supply', description: 'Building materials sourcing and supply chain plan', order: 4 },
    { projectType: ProjectType.housing, name: 'Sanitation Plan', description: 'Water, sewage, and waste management systems', order: 5 },
    { projectType: ProjectType.housing, name: 'Budget per Unit', description: 'Cost breakdown per housing unit', order: 6 },
    { projectType: ProjectType.housing, name: 'Displacement Impact', description: 'Assessment of families displaced or relocated', order: 7 },
    ...sharedSections.map(s => ({ projectType: ProjectType.housing, ...s })),
  ];

  const existingTemplateCount = await prisma.studyDepartmentTemplate.count();
  if (existingTemplateCount === 0) {
    const templateResult = await prisma.studyDepartmentTemplate.createMany({
      data: templatesByType.map(t => ({
        projectType: t.projectType,
        name: t.name,
        description: t.description ?? null,
        isRequired: true,
        order: t.order,
        isActive: true,
      })),
    });
    console.log(`✅ Created ${templateResult.count} study department templates`);
  } else {
    console.log(`✅ Study department templates already seeded (${existingTemplateCount} found)`);
  }

  console.log('\n✨ Database seeded successfully!');
  console.log('\nTest accounts:');
  console.log('  Admin:              admin@helpinghands.org     / Admin@123456');
  console.log('  Employee:           employee@helpinghands.org  / Employee@123');
  console.log('  Financial Officer:  officer@helpinghands.org   / Officer@123');
  console.log('  Participant:        participant@example.com    / Participant@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
