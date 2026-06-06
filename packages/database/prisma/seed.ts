import { PrismaClient, AdminRole, BlockCategory, ProjectCategory, Representation } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  const block = await prisma.block.create({
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

  await prisma.project.create({
    data: {
      blockId: block.id,
      location: 'Rural District, South Region',
      value: 50000.0,
      progression: 0,
      isCompleted: false,
      category: ProjectCategory.agricultural,
      expectedStartDate: new Date('2024-03-01'),
      financialOfficerId: foPerson.id,
    },
  });
  console.log('✅ Created sample project');

  // ─── About Us Block ────────────────────────────────────────────────────────────
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
  console.log('✅ Created about us content');

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
