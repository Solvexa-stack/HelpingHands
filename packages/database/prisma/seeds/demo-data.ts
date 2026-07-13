import {
  AccountKind,
  AccountOwnerType,
  AdminRole,
  BlockCategory,
  DonationStatus,
  ExecutionStage,
  ExpenseCategory,
  FundDonationMethod,
  FundingAgreementStatus,
  FundStatus,
  FundType,
  GovernanceSubjectType,
  LedgerDirection,
  OrganizationStatus,
  OrganizationType,
  OrgReportStatus,
  OrgReportType,
  ParticipationRole,
  PartyType,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  Prisma,
  Representation,
  RoleScopeType,
  SectionStatus,
  StudyStatus,
  VoteChoice,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { backfillTreasury } from '../backfills/w5-treasury-backfill';

/**
 * Demo data seeding (production-safe): populates the platform with a
 * realistic, internally-consistent story across every module so the site
 * and admin dashboard look alive. Purely additive — never updates or
 * deletes pre-existing rows — and idempotent by construction: every
 * creator below checks a natural key (email, slug, name, or a `[[seed:x]]`
 * marker embedded in a notes/description field) before writing.
 *
 * Governance/workflow/treasury derived tables (VoteRound, Vote for
 * project studies, WorkflowInstance, and the project-level ledger for cash
 * donations) are intentionally NOT hand-built here — this seed creates the
 * legacy-shaped source rows (StudyVote, ProjectStudy.status,
 * Project.studyStatus/isCompleted, ProjectTransaction) and the caller
 * re-runs the existing W3/W4/W5 backfills (see seed-demo.ts), which derive
 * those tables with already-verified rules instead of duplicating them.
 */

const DEMO_PASSWORD = 'Demo@12345';
const MARK = (key: string) => `[[seed:${key}]]`;

// ─── Generic helpers ──────────────────────────────────────────────────────────

async function findOrCreate<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<{ row: T; created: boolean }> {
  const existing = await find();
  if (existing) return { row: existing, created: false };
  return { row: await create(), created: true };
}

function qrToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Identity helpers ─────────────────────────────────────────────────────────

interface StaffSpec {
  firstName: string;
  lastName: string;
  email: string;
  adminRole: AdminRole;
}

async function ensureStaffUser(prisma: PrismaClient, spec: StaffSpec) {
  const existing = await prisma.user.findUnique({ where: { email: spec.email }, include: { admin: true } });
  if (existing) return { user: existing, created: false };
  const admin = await prisma.admin.create({ data: { firstName: spec.firstName, lastName: spec.lastName, role: spec.adminRole } });
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      referenceId: admin.id,
      referenceType: 'admin',
      email: spec.email,
      password,
      isActive: true,
      joiningDate: daysAgo(200),
    },
    include: { admin: true },
  });
  return { user, created: true };
}

async function ensureParticipant(prisma: PrismaClient, firstName: string, lastName: string, representation: Representation) {
  return findOrCreate(
    () => prisma.participant.findFirst({ where: { firstName, lastName, representation } }),
    () => prisma.participant.create({ data: { firstName, lastName, representation } }),
  );
}

async function ensureParticipantWithLogin(
  prisma: PrismaClient,
  firstName: string,
  lastName: string,
  representation: Representation,
  email: string,
) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const participant = await prisma.participant.findUnique({ where: { id: existingUser.referenceId } });
    return { participant: participant!, user: existingUser, created: false };
  }
  const participant = await prisma.participant.create({ data: { firstName, lastName, representation } });
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.create({
    data: { referenceId: participant.id, referenceType: 'participant', email, password, isActive: true, joiningDate: daysAgo(150) },
  });
  return { participant, user, created: true };
}

async function grantRole(
  prisma: PrismaClient,
  userId: number,
  role: string,
  scopeType: RoleScopeType,
  scopeId: number | null,
  grantedBy?: number,
) {
  return findOrCreate(
    () => prisma.roleAssignment.findFirst({ where: { userId, role, scopeType, scopeId } }),
    () => prisma.roleAssignment.create({ data: { userId, role, scopeType, scopeId, grantedBy } }),
  );
}

async function ensureMembership(prisma: PrismaClient, organizationId: number, userId: number) {
  return prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: {},
    create: { organizationId, userId },
  });
}

// ─── Treasury/ledger helpers (mirror TreasuryService, direct-Prisma) ─────────

async function ensureAccount(
  prisma: PrismaClient,
  ownerType: AccountOwnerType,
  ownerId: number | null,
  name: string,
  kind: AccountKind,
) {
  const { row } = await findOrCreate(
    () => prisma.account.findFirst({ where: ownerId != null ? { ownerType, ownerId, currency: 'USD' } : { ownerType, name, currency: 'USD' } }),
    () => prisma.account.create({ data: { ownerType, ownerId, name, kind, currency: 'USD' } }),
  );
  return row;
}

function fundAccount(prisma: PrismaClient, fundId: number, fundName: string) {
  return ensureAccount(prisma, 'fund', fundId, `Fund: ${fundName}`, 'liability');
}

const PLATFORM_ACCOUNT_SPECS: Record<string, { ownerType: AccountOwnerType; name: string; kind: AccountKind }> = {
  cash: { ownerType: 'provider_clearing', name: 'Physical Cash Intake', kind: 'asset' },
  stripe: { ownerType: 'provider_clearing', name: 'Stripe Clearing', kind: 'asset' },
  paypal: { ownerType: 'provider_clearing', name: 'PayPal Clearing', kind: 'asset' },
  external: { ownerType: 'external', name: 'External Counterparties', kind: 'expense' },
};

function platformAccount(prisma: PrismaClient, key: keyof typeof PLATFORM_ACCOUNT_SPECS) {
  const spec = PLATFORM_ACCOUNT_SPECS[key];
  return ensureAccount(prisma, spec.ownerType, null, spec.name, spec.kind);
}

interface PostingEntry {
  accountId: number;
  direction: LedgerDirection;
  amount: number;
}

/** Idempotent on (referenceType, referenceId, event) — same contract as TreasuryService.post, minus actor/events. */
async function postLedger(
  prisma: PrismaClient,
  input: { description: string; referenceType: string; referenceId: number; event: string; entries: PostingEntry[]; timestamp?: Date },
) {
  const existing = await prisma.ledgerTransaction.findFirst({
    where: { referenceType: input.referenceType, referenceId: input.referenceId, event: input.event },
  });
  if (existing) return existing;
  return prisma.ledgerTransaction.create({
    data: {
      timestamp: input.timestamp,
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      event: input.event,
      entries: { create: input.entries.map((e) => ({ accountId: e.accountId, direction: e.direction, amount: new Prisma.Decimal(e.amount), currency: 'USD' })) },
    },
  });
}

// ─── Content block helpers ────────────────────────────────────────────────────

interface BlockSpec {
  category: BlockCategory;
  classification?: string;
  slug: string;
  slugAr: string;
  name: string;
  nameAr: string;
  brief: string;
  briefAr: string;
  description: string;
  descriptionAr: string;
  imageSeed: string;
  orderId?: number;
}

async function ensureBlock(prisma: PrismaClient, spec: BlockSpec): Promise<{ id: number; created: boolean }> {
  const existing = await prisma.blockTranslation.findFirst({ where: { slug: spec.slug }, select: { blockId: true } });
  if (existing) return { id: existing.blockId, created: false };
  const block = await prisma.block.create({
    data: {
      category: spec.category,
      classification: spec.classification,
      isActive: true,
      orderId: spec.orderId ?? 0,
      translations: {
        create: [
          { languageCode: 'en', name: spec.name, slug: spec.slug, brief: spec.brief, description: spec.description },
          { languageCode: 'ar', name: spec.nameAr, slug: spec.slugAr, brief: spec.briefAr, description: spec.descriptionAr },
        ],
      },
    },
  });
  await prisma.file.create({
    data: {
      referenceId: block.id,
      referenceType: 'block',
      name: `${spec.slug}-cover`,
      url: `https://picsum.photos/seed/${spec.imageSeed}/1200/800`,
      fileType: 'image',
      isCover: true,
      isActive: true,
    },
  });
  return { id: block.id, created: true };
}

// ─── Summary accumulator ──────────────────────────────────────────────────────

class Counter {
  private counts = new Map<string, number>();
  add(key: string, n = 1) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + n);
  }
  toObject(): Record<string, number> {
    return Object.fromEntries([...this.counts.entries()].sort());
  }
}

export interface DemoSeedResult {
  counts: Record<string, number>;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function seedDemoData(prisma: PrismaClient): Promise<DemoSeedResult> {
  const c = new Counter();

  // ═══ 3. Sectors — extend the existing civic taxonomy (no schema change) ═════
  const extraSectors: Array<{ key: string; name: string; nameAr: string; order: number }> = [
    { key: 'food_security', name: 'Food Security', nameAr: 'الأمن الغذائي', order: 13 },
    { key: 'environment', name: 'Environment', nameAr: 'البيئة', order: 14 },
  ];
  for (const s of extraSectors) {
    const before = await prisma.projectCategoryNode.findUnique({ where: { key: s.key } });
    await prisma.projectCategoryNode.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, name: s.name, nameAr: s.nameAr, order: s.order, isActive: true },
    });
    if (!before) c.add('sectorsCreated');
  }
  const sectorKeys = ['water', 'education', 'healthcare', 'housing', 'emergency_relief', 'food_security', 'environment'];
  const sectorNodes = await prisma.projectCategoryNode.findMany({ where: { key: { in: sectorKeys } } });
  const sectorByKey = new Map(sectorNodes.map((n) => [n.key, n]));

  // ═══ 1a. Platform users (super admin + board) ═══════════════════════════════
  const { user: superAdminUser } = await ensureStaffUser(prisma, {
    firstName: 'System',
    lastName: 'Administrator',
    email: 'admin@helpinghands.org',
    adminRole: AdminRole.administrator,
  });
  const superAdminGrant = await grantRole(prisma, superAdminUser.id, 'super_admin', 'platform', null, superAdminUser.id);
  if (superAdminGrant.created) c.add('platformRoleGrants');

  const boardStaff: StaffSpec[] = [
    { firstName: 'Board', lastName: 'Chair', email: 'chair@helpinghands.org', adminRole: AdminRole.administrator },
    { firstName: 'Layla', lastName: 'Board Member', email: 'board.member1@helpinghands.org', adminRole: AdminRole.administrator },
    { firstName: 'Marcus', lastName: 'Board Member', email: 'board.member2@helpinghands.org', adminRole: AdminRole.administrator },
    { firstName: 'Board', lastName: 'Secretary', email: 'secretary@helpinghands.org', adminRole: AdminRole.administrator },
    { firstName: 'Platform', lastName: 'Auditor', email: 'auditor@helpinghands.org', adminRole: AdminRole.administrator },
  ];
  const boardRoles = ['board_chair', 'board_member', 'board_member', 'board_secretary', 'platform_auditor'];
  const boardUsers: Array<{ id: number }> = [];
  for (let i = 0; i < boardStaff.length; i++) {
    const { user, created } = await ensureStaffUser(prisma, boardStaff[i]);
    boardUsers.push(user);
    await grantRole(prisma, user.id, boardRoles[i], 'platform', null, superAdminUser.id);
    if (created) c.add('platformUsersCreated');
  }
  const boardChairUser = boardUsers[0];

  // ═══ 2. Organizations ════════════════════════════════════════════════════════
  const CAPABILITIES_BY_TYPE: Record<OrganizationType, Record<string, boolean>> = {
    ngo: { canExecuteProjects: true, canReceivePublicFunds: true, canOpenDonations: true, isGovernmentEntity: false, requiresBoardOversight: false },
    municipality: { canExecuteProjects: true, canReceivePublicFunds: true, canOpenDonations: false, isGovernmentEntity: true, requiresBoardOversight: true },
    youth_team: { canExecuteProjects: true, canReceivePublicFunds: false, canOpenDonations: true, isGovernmentEntity: false, requiresBoardOversight: false },
    initiative: { canExecuteProjects: true, canReceivePublicFunds: false, canOpenDonations: false, isGovernmentEntity: false, requiresBoardOversight: false },
    board: { canExecuteProjects: false, canReceivePublicFunds: false, canOpenDonations: false, isGovernmentEntity: false, requiresBoardOversight: false },
    council: { canExecuteProjects: true, canReceivePublicFunds: true, canOpenDonations: false, isGovernmentEntity: true, requiresBoardOversight: true },
  };

  async function ensureOrg(type: OrganizationType, name: string, registrationNumber?: string) {
    const { row, created } = await findOrCreate(
      () => prisma.organization.findFirst({ where: { type, name } }),
      () =>
        prisma.organization.create({
          data: {
            type,
            name,
            status: OrganizationStatus.active,
            capabilities: CAPABILITIES_BY_TYPE[type] as Prisma.InputJsonValue,
            registrationNumber,
            verifiedAt: daysAgo(180),
            verifiedBy: superAdminUser.id,
          },
        }),
    );
    if (created) c.add('organizationsCreated');
    return row;
  }

  const orgFoundation = await ensureOrg(OrganizationType.ngo, 'HelpingHands Foundation', 'NGO-1001');
  const orgWater = await ensureOrg(OrganizationType.ngo, 'Clean Water Initiative', 'NGO-1002');
  const orgEducation = await ensureOrg(OrganizationType.ngo, 'Education For All', 'NGO-1003');
  const orgMedical = await ensureOrg(OrganizationType.ngo, 'Medical Support Organization', 'NGO-1004');
  const orgMunicipality = await ensureOrg(OrganizationType.municipality, 'Sunrise Municipality', 'MUN-2001');
  const orgYouth = await ensureOrg(OrganizationType.youth_team, 'Youth Builders Team');
  const orgInitiative = await ensureOrg(OrganizationType.initiative, 'Neighbors Relief Initiative');

  // Board decisions verifying each organization (governance §11)
  for (const org of [orgFoundation, orgWater, orgEducation, orgMedical, orgMunicipality, orgYouth, orgInitiative]) {
    const { created } = await findOrCreate(
      () => prisma.boardDecision.findFirst({ where: { subjectType: GovernanceSubjectType.organization, subjectId: org.id } }),
      () =>
        prisma.boardDecision.create({
          data: {
            subjectType: GovernanceSubjectType.organization,
            subjectId: org.id,
            decision: 'approved',
            rationale: `${org.name} registration documents verified; capabilities activated per organization type.`,
            decidedById: boardChairUser.id,
            decidedAt: daysAgo(175),
          },
        }),
    );
    if (created) c.add('boardDecisionsCreated');
  }

  // ═══ 1b. Org staff (org admins, project managers, financial officers) ═══════
  const orgStaffTable: Array<{ org: typeof orgFoundation; slug: string }> = [
    { org: orgFoundation, slug: 'foundation' },
    { org: orgWater, slug: 'water' },
    { org: orgEducation, slug: 'education' },
    { org: orgMedical, slug: 'medical' },
  ];
  const orgAccountant = new Map<number, number>(); // organizationId -> userId, for expense/report authorship
  const orgProjectManager = new Map<number, number>();
  const orgAdmin = new Map<number, number>();

  for (const { org, slug } of orgStaffTable) {
    const { user: admin, created: adminCreated } = await ensureStaffUser(prisma, {
      firstName: 'Org Admin',
      lastName: org.name,
      email: `admin.${slug}@helpinghands.org`,
      adminRole: AdminRole.administrator,
    });
    const { user: pm, created: pmCreated } = await ensureStaffUser(prisma, {
      firstName: 'Project Manager',
      lastName: org.name,
      email: `pm.${slug}@helpinghands.org`,
      adminRole: AdminRole.employee,
    });
    const { user: accountant, created: accountantCreated } = await ensureStaffUser(prisma, {
      firstName: 'Financial Officer',
      lastName: org.name,
      email: `finance.${slug}@helpinghands.org`,
      adminRole: AdminRole.financial_officer,
    });
    for (const [user, role, created] of [
      [admin, 'org_admin', adminCreated],
      [pm, 'project_manager', pmCreated],
      [accountant, 'org_accountant', accountantCreated],
    ] as const) {
      await ensureMembership(prisma, org.id, user.id);
      await grantRole(prisma, user.id, role, 'organization', org.id, superAdminUser.id);
      if (created) c.add('orgStaffUsersCreated');
    }
    orgAdmin.set(org.id, admin.id);
    orgProjectManager.set(org.id, pm.id);
    orgAccountant.set(org.id, accountant.id);
  }
  // Lighter staffing for the smaller orgs
  for (const org of [orgMunicipality, orgYouth, orgInitiative]) {
    const { user: admin, created } = await ensureStaffUser(prisma, {
      firstName: 'Org Admin',
      lastName: org.name,
      email: `admin.${org.name.toLowerCase().replace(/[^a-z]+/g, '-')}@helpinghands.org`,
      adminRole: AdminRole.administrator,
    });
    await ensureMembership(prisma, org.id, admin.id);
    await grantRole(prisma, admin.id, 'org_admin', 'organization', org.id, superAdminUser.id);
    orgAdmin.set(org.id, admin.id);
    if (created) c.add('orgStaffUsersCreated');
  }

  // ═══ 4. Funds ════════════════════════════════════════════════════════════════
  const masterFundCache = new Map<number, { id: number; name: string }>();
  async function ensureMasterFund(nodeId: number): Promise<{ id: number; name: string }> {
    if (masterFundCache.has(nodeId)) return masterFundCache.get(nodeId)!;
    const existing = await prisma.fund.findFirst({ where: { type: FundType.master, categoryId: nodeId, deletedAt: null } });
    if (existing) {
      masterFundCache.set(nodeId, existing);
      return existing;
    }
    const node = await prisma.projectCategoryNode.findUniqueOrThrow({ where: { id: nodeId } });
    const parentFundId = node.parentId != null ? (await ensureMasterFund(node.parentId)).id : undefined;
    const fund = await prisma.fund.create({
      data: {
        name: `${node.name} Master Fund`,
        type: FundType.master,
        categoryId: nodeId,
        parentFundId,
        status: FundStatus.active,
        purpose: `Sector-wide master fund for ${node.name}.`,
        policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue,
      },
    });
    await fundAccount(prisma, fund.id, fund.name);
    c.add('fundsCreated');
    masterFundCache.set(nodeId, fund);
    return fund;
  }

  async function ensureOrgFund(organizationId: number, orgName: string, nodeId: number) {
    const existing = await prisma.fund.findFirst({ where: { type: FundType.organization, categoryId: nodeId, managingOrganizationId: organizationId, deletedAt: null } });
    if (existing) return existing;
    const [master, node] = await Promise.all([ensureMasterFund(nodeId), prisma.projectCategoryNode.findUniqueOrThrow({ where: { id: nodeId } })]);
    const fund = await prisma.fund.create({
      data: {
        name: `${orgName} ${node.name} Fund`,
        type: FundType.organization,
        categoryId: nodeId,
        managingOrganizationId: organizationId,
        parentFundId: master.id,
        status: FundStatus.active,
        purpose: `${orgName}'s dedicated fund for ${node.name} projects.`,
        policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue,
      },
    });
    await fundAccount(prisma, fund.id, fund.name);
    c.add('fundsCreated');
    return fund;
  }

  const waterFund = await ensureOrgFund(orgWater.id, orgWater.name, sectorByKey.get('water')!.id);
  const educationFund = await ensureOrgFund(orgEducation.id, orgEducation.name, sectorByKey.get('education')!.id);
  const healthFund = await ensureOrgFund(orgMedical.id, orgMedical.name, sectorByKey.get('healthcare')!.id);
  const housingFund = await ensureOrgFund(orgFoundation.id, orgFoundation.name, sectorByKey.get('housing')!.id);
  const emergencyFund = await ensureOrgFund(orgFoundation.id, orgFoundation.name, sectorByKey.get('emergency_relief')!.id);
  const foodFund = await ensureOrgFund(orgFoundation.id, orgFoundation.name, sectorByKey.get('food_security')!.id);
  const envFund = await ensureOrgFund(orgInitiative.id, orgInitiative.name, sectorByKey.get('environment')!.id);

  // Project-earmarked funds (still FundType.organization — schema has no
  // distinct "project" FundType; a fund dedicated to one project via its
  // `purpose` + FundAllocation is how the platform expresses this today).
  async function ensureProjectFund(name: string, purpose: string, managingOrganizationId: number) {
    const { row, created } = await findOrCreate(
      () => prisma.fund.findFirst({ where: { name, deletedAt: null } }),
      () =>
        prisma.fund.create({
          data: { name, purpose, type: FundType.organization, managingOrganizationId, status: FundStatus.active, policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue },
        }),
    );
    if (created) {
      await fundAccount(prisma, row.id, row.name);
      c.add('fundsCreated');
    }
    return row;
  }
  const solarWellsFund = await ensureProjectFund('Solar Water Wells Project Fund', 'Earmarked for drilling and solar-pump installation on the Solar Water Wells Project.', orgWater.id);
  const clinicFund = await ensureProjectFund('Mobile Medical Clinic Fund', 'Earmarked for vehicle, equipment, and staffing of the Mobile Medical Clinic.', orgMedical.id);

  // A donor-backed fund
  const majorDonor = await findOrCreate(
    () => prisma.donor.findFirst({ where: { name: 'Al-Noor Holdings', type: PartyType.company } }),
    () =>
      prisma.donor.create({
        data: { name: 'Al-Noor Holdings', type: PartyType.company, contactEmail: 'giving@alnoorholdings.example.com', contactPhone: '+961-1-555-2000', createdByUserId: superAdminUser.id },
      }),
  );
  if (majorDonor.created) c.add('donorsCreated');
  const donorFund = await findOrCreate(
    () => prisma.fund.findFirst({ where: { name: 'Al-Noor Holdings Corporate Giving Fund', deletedAt: null } }),
    () =>
      prisma.fund.create({
        data: {
          name: 'Al-Noor Holdings Corporate Giving Fund',
          purpose: 'Annual corporate giving commitment, disbursed at the donor’s direction across active sectors.',
          type: FundType.donor,
          donorId: majorDonor.row.id,
          status: FundStatus.active,
          policy: { dualApprovalThreshold: 0 } as Prisma.InputJsonValue,
        },
      }),
  );
  if (donorFund.created) {
    await fundAccount(prisma, donorFund.row.id, donorFund.row.name);
    c.add('fundsCreated');
  }

  return runProjectsAndBeyond(prisma, c, {
    superAdminUser,
    boardChairUser,
    boardUsers,
    sectorByKey,
    orgFoundation,
    orgWater,
    orgEducation,
    orgMedical,
    orgMunicipality,
    orgYouth,
    orgInitiative,
    orgAdmin,
    orgProjectManager,
    orgAccountant,
    waterFund,
    educationFund,
    healthFund,
    housingFund,
    emergencyFund,
    foodFund,
    envFund,
    solarWellsFund,
    clinicFund,
    donorFund: donorFund.row,
    majorDonor: majorDonor.row,
  });
}

// The rest of the story (projects → studies/votes → donations → expenses →
// allocations → reports → agreements → website content) lives in this
// second function purely to keep each function under a readable length;
// it is not a separate concern, just a continuation of seedDemoData.
async function runProjectsAndBeyond(
  prisma: PrismaClient,
  c: Counter,
  ctx: {
    superAdminUser: { id: number };
    boardChairUser: { id: number };
    boardUsers: Array<{ id: number }>;
    sectorByKey: Map<string, { id: number; name: string }>;
    orgFoundation: { id: number; name: string };
    orgWater: { id: number; name: string };
    orgEducation: { id: number; name: string };
    orgMedical: { id: number; name: string };
    orgMunicipality: { id: number; name: string };
    orgYouth: { id: number; name: string };
    orgInitiative: { id: number; name: string };
    orgAdmin: Map<number, number>;
    orgProjectManager: Map<number, number>;
    orgAccountant: Map<number, number>;
    waterFund: { id: number; name: string };
    educationFund: { id: number; name: string };
    healthFund: { id: number; name: string };
    housingFund: { id: number; name: string };
    emergencyFund: { id: number; name: string };
    foodFund: { id: number; name: string };
    envFund: { id: number; name: string };
    solarWellsFund: { id: number; name: string };
    clinicFund: { id: number; name: string };
    donorFund: { id: number; name: string };
    majorDonor: { id: number; name: string };
  },
): Promise<DemoSeedResult> {
  const {
    superAdminUser,
    boardChairUser,
    boardUsers,
    sectorByKey,
    orgFoundation,
    orgWater,
    orgEducation,
    orgMedical,
    orgMunicipality,
    orgYouth,
    orgInitiative,
    orgAdmin,
    orgProjectManager,
    orgAccountant,
    waterFund,
    educationFund,
    healthFund,
    housingFund,
    emergencyFund,
    foodFund,
    envFund,
    solarWellsFund,
    clinicFund,
    donorFund,
    majorDonor,
  } = ctx;

  // ═══ 5. Projects ═════════════════════════════════════════════════════════════
  interface ProjectSpec {
    slug: string;
    slugAr: string;
    name: string;
    nameAr: string;
    brief: string;
    briefAr: string;
    description: string;
    descriptionAr: string;
    location: string;
    value: number;
    org: { id: number; name: string };
    sectorKey: string;
    studyStatus: StudyStatus | null;
    isCompleted: boolean;
    expectedStartDate: Date;
    dateOfCompletion?: Date;
    financialOfficerAdminId?: number;
    imageSeed: string;
  }

  const projectSpecs: ProjectSpec[] = [
    {
      slug: 'solar-water-wells-project',
      slugAr: 'mashrou-abar-al-miyah-al-shamsiya',
      name: 'Solar Water Wells Project',
      nameAr: 'مشروع آبار المياه بالطاقة الشمسية',
      brief: 'Drilling solar-powered wells for five rural villages',
      briefAr: 'حفر آبار تعمل بالطاقة الشمسية لخمس قرى ريفية',
      description:
        'Drills and equips five solar-powered water wells across rural villages currently reliant on trucked water, providing year-round clean water access for over 3,000 residents.',
      descriptionAr: 'حفر وتجهيز خمسة آبار مياه تعمل بالطاقة الشمسية في قرى ريفية توفر مياهاً نظيفة لأكثر من 3000 مقيم على مدار العام.',
      location: 'Beqaa Valley, Rural District',
      value: 95000,
      org: orgWater,
      sectorKey: 'water',
      studyStatus: StudyStatus.approved,
      isCompleted: false,
      expectedStartDate: daysAgo(160),
      financialOfficerAdminId: orgAccountant.get(orgWater.id),
      imageSeed: 'solar-wells',
    },
    {
      slug: 'rural-water-network-expansion',
      slugAr: 'tawsee-shabakat-al-miyah-al-rifiya',
      name: 'Rural Water Network Expansion',
      nameAr: 'توسيع شبكة المياه الريفية',
      brief: 'Extending piped water access to underserved hamlets',
      briefAr: 'توسيع شبكة مياه الأنابيب إلى المناطق المحرومة',
      description:
        'Extends the municipal piped-water network by 12km to connect four underserved hamlets currently outside the grid, in partnership with Sunrise Municipality.',
      descriptionAr: 'توسيع شبكة المياه البلدية بمسافة 12 كم لربط أربع مناطق محرومة خارج الشبكة الحالية، بالشراكة مع بلدية صنرايز.',
      location: 'Sunrise Municipality, North Corridor',
      value: 120000,
      org: orgWater,
      sectorKey: 'water',
      studyStatus: StudyStatus.voting_open,
      isCompleted: false,
      expectedStartDate: daysAgo(20),
      financialOfficerAdminId: orgAccountant.get(orgWater.id),
      imageSeed: 'water-network',
    },
    {
      slug: 'school-renovation-program',
      slugAr: 'barnamej-tarmim-al-madaris',
      name: 'School Renovation Program',
      nameAr: 'برنامج ترميم المدارس',
      brief: 'Rebuilding classrooms and sanitation in six public schools',
      briefAr: 'إعادة بناء الفصول الدراسية والمرافق الصحية في ست مدارس عامة',
      description:
        'Renovates classrooms, roofing, and sanitation facilities in six public schools serving over 2,400 students, fully funded and completed ahead of the new school year.',
      descriptionAr: 'ترميم الفصول الدراسية والأسقف والمرافق الصحية في ست مدارس عامة تخدم أكثر من 2400 طالب، تم تمويله وإنجازه بالكامل.',
      location: 'Education For All service area',
      value: 60000,
      org: orgEducation,
      sectorKey: 'education',
      studyStatus: StudyStatus.approved,
      isCompleted: true,
      expectedStartDate: daysAgo(300),
      dateOfCompletion: daysAgo(30),
      financialOfficerAdminId: orgAccountant.get(orgEducation.id),
      imageSeed: 'school-renovation',
    },
    {
      slug: 'scholarship-program',
      slugAr: 'barnamej-al-minah-al-diraseya',
      name: 'Scholarship Program',
      nameAr: 'برنامج المنح الدراسية',
      brief: 'University scholarships for high-achieving low-income students',
      briefAr: 'منح جامعية للطلاب المتفوقين من ذوي الدخل المحدود',
      description:
        'Funds full-tuition university scholarships for 40 high-achieving students from low-income households, including a stipend for books and transport.',
      descriptionAr: 'تمويل منح جامعية كاملة لـ 40 طالباً متفوقاً من أسر محدودة الدخل، تشمل بدلاً للكتب والمواصلات.',
      location: 'Education For All service area',
      value: 80000,
      org: orgEducation,
      sectorKey: 'education',
      studyStatus: StudyStatus.in_review,
      isCompleted: false,
      expectedStartDate: daysAgo(5),
      financialOfficerAdminId: orgAccountant.get(orgEducation.id),
      imageSeed: 'scholarship',
    },
    {
      slug: 'mobile-medical-clinic',
      slugAr: 'al-eyada-al-tibbiya-al-mutanaqila',
      name: 'Mobile Medical Clinic',
      nameAr: 'العيادة الطبية المتنقلة',
      brief: 'A fully equipped mobile clinic reaching remote communities',
      briefAr: 'عيادة متنقلة مجهزة بالكامل تخدم المجتمعات النائية',
      description:
        'Outfits and operates a mobile medical clinic delivering primary care, vaccinations, and maternal health services to remote communities with no nearby clinic.',
      descriptionAr: 'تجهيز وتشغيل عيادة طبية متنقلة تقدم الرعاية الأولية والتطعيمات وخدمات صحة الأمومة للمجتمعات النائية.',
      location: 'Medical Support Organization catchment area',
      value: 110000,
      org: orgMedical,
      sectorKey: 'healthcare',
      studyStatus: StudyStatus.approved,
      isCompleted: false,
      expectedStartDate: daysAgo(90),
      financialOfficerAdminId: orgAccountant.get(orgMedical.id),
      imageSeed: 'mobile-clinic',
    },
    {
      slug: 'emergency-housing-support',
      slugAr: 'daam-al-eskan-al-tari',
      name: 'Emergency Housing Support',
      nameAr: 'دعم الإسكان الطارئ',
      brief: 'Temporary and transitional housing for displaced families',
      briefAr: 'إسكان مؤقت وانتقالي للأسر النازحة',
      description:
        'Provides transitional housing units and rent subsidies for 25 families displaced by recent flooding, coordinated with Sunrise Municipality.',
      descriptionAr: 'توفير وحدات سكن انتقالي وإعانات إيجار لـ 25 أسرة نازحة بسبب الفيضانات الأخيرة، بالتنسيق مع بلدية صنرايز.',
      location: 'Sunrise Municipality',
      value: 70000,
      org: orgFoundation,
      sectorKey: 'housing',
      studyStatus: StudyStatus.published,
      isCompleted: false,
      expectedStartDate: daysAgo(2),
      financialOfficerAdminId: orgAccountant.get(orgFoundation.id),
      imageSeed: 'emergency-housing',
    },
    {
      slug: 'community-food-bank-network',
      slugAr: 'shabakat-bank-al-taam-al-mojtamaie',
      name: 'Community Food Bank Network',
      nameAr: 'شبكة بنك الطعام المجتمعي',
      brief: 'A network of neighborhood food banks for food-insecure families',
      briefAr: 'شبكة من بنوك الطعام المحلية للأسر التي تعاني من انعدام الأمن الغذائي',
      description:
        'Establishes three neighborhood food-bank hubs with cold storage and a monthly distribution schedule for 600 food-insecure households.',
      descriptionAr: 'إنشاء ثلاثة مراكز بنك طعام محلية مزودة بتبريد وجدول توزيع شهري لـ 600 أسرة تعاني من انعدام الأمن الغذائي.',
      location: 'HelpingHands Foundation service area',
      value: 45000,
      org: orgFoundation,
      sectorKey: 'food_security',
      studyStatus: StudyStatus.draft,
      isCompleted: false,
      expectedStartDate: daysAgo(1),
      financialOfficerAdminId: orgAccountant.get(orgFoundation.id),
      imageSeed: 'food-bank',
    },
    {
      slug: 'neighborhood-solar-microgrid',
      slugAr: 'al-shabaka-al-shamsiya-al-mahaliya',
      name: 'Neighborhood Solar Microgrid',
      nameAr: 'الشبكة الشمسية المحلية الصغيرة',
      brief: 'A shared solar microgrid proposal for an off-grid neighborhood',
      briefAr: 'اقتراح شبكة شمسية محلية مشتركة لحي غير متصل بالشبكة',
      description:
        'Proposed a shared solar microgrid for an off-grid neighborhood; the feasibility study found the terrain unsuitable for the proposed panel layout and the Board declined to proceed.',
      descriptionAr: 'اقتراح شبكة شمسية محلية مشتركة لحي غير متصل بالشبكة؛ وجدت دراسة الجدوى أن التضاريس غير مناسبة وقرر المجلس عدم المتابعة.',
      location: 'Neighbors Relief Initiative service area',
      value: 55000,
      org: orgInitiative,
      sectorKey: 'environment',
      studyStatus: StudyStatus.rejected,
      isCompleted: false,
      expectedStartDate: daysAgo(200),
      financialOfficerAdminId: orgAccountant.get(orgFoundation.id),
      imageSeed: 'solar-microgrid',
    },
  ];

  const projects = new Map<string, { id: number; blockId: number; value: number; org: { id: number; name: string }; spec: ProjectSpec }>();
  for (const spec of projectSpecs) {
    const { id: blockId, created: blockCreated } = await ensureBlock(prisma, {
      category: BlockCategory.project,
      slug: spec.slug,
      slugAr: spec.slugAr,
      name: spec.name,
      nameAr: spec.nameAr,
      brief: spec.brief,
      briefAr: spec.briefAr,
      description: spec.description,
      descriptionAr: spec.descriptionAr,
      imageSeed: spec.imageSeed,
    });
    if (blockCreated) c.add('blocksCreated');

    const { row: project, created } = await findOrCreate(
      () => prisma.project.findUnique({ where: { blockId } }),
      () =>
        prisma.project.create({
          data: {
            blockId,
            location: spec.location,
            value: new Prisma.Decimal(spec.value),
            progression: 0,
            isCompleted: false,
            categoryId: sectorByKey.get(spec.sectorKey)!.id,
            expectedStartDate: spec.expectedStartDate,
            dateOfCompletion: spec.dateOfCompletion,
            financialOfficerId: spec.financialOfficerAdminId,
            studyStatus: spec.studyStatus,
            ownerOrganizationId: spec.org.id,
            currentStage: spec.isCompleted
              ? ExecutionStage.completion
              : spec.studyStatus === StudyStatus.approved
                ? ExecutionStage.execution
                : undefined,
          },
        }),
    );
    if (created) c.add('projectsCreated');
    projects.set(spec.slug, { id: project.id, blockId, value: spec.value, org: spec.org, spec });
  }

  // ═══ 6. Project participation ═══════════════════════════════════════════════
  async function participate(projectId: number, organizationId: number, role: ParticipationRole, notes?: string) {
    const { created } = await findOrCreate(
      () => prisma.projectParticipation.findUnique({ where: { projectId_organizationId_role: { projectId, organizationId, role } } }),
      () => prisma.projectParticipation.create({ data: { projectId, organizationId, role, notes, createdByUserId: superAdminUser.id } }),
    );
    if (created) c.add('projectParticipationsCreated');
  }
  for (const [slug, p] of projects) {
    await participate(p.id, p.org.id, ParticipationRole.owner);
  }
  const waterNetwork = projects.get('rural-water-network-expansion')!;
  await participate(waterNetwork.id, orgMunicipality.id, ParticipationRole.supervising, 'Municipality supervises right-of-way and permitting.');
  await participate(waterNetwork.id, orgFoundation.id, ParticipationRole.funding_partner, 'Co-funds via the Housing & Emergency master fund network.');
  const housing = projects.get('emergency-housing-support')!;
  await participate(housing.id, orgMunicipality.id, ParticipationRole.supervising, 'Municipality supervises site allocation.');
  await participate(housing.id, orgYouth.id, ParticipationRole.executing_agency, 'Youth Builders Team executes construction labor.');
  const clinic = projects.get('mobile-medical-clinic')!;
  await participate(clinic.id, orgFoundation.id, ParticipationRole.funding_partner);
  const foodBank = projects.get('community-food-bank-network')!;
  await participate(foodBank.id, orgYouth.id, ParticipationRole.beneficiary_rep, 'Represents youth-led neighborhood distribution volunteers.');

  // ═══ 7. Studies (feasibility/impact/technical, per project) ════════════════
  const SECTIONS = [
    { name: 'Feasibility Study', order: 1 },
    { name: 'Technical Study', order: 2 },
    { name: 'Financial Overview', order: 3 },
    { name: 'Impact Study', order: 4 },
  ];

  interface VoterSpec {
    userId: number;
    choice: VoteChoice;
    comment?: string;
  }

  async function buildStudy(
    projectSlug: string,
    summary: string,
    opts: { votingStartsAt?: Date; votingEndsAt?: Date; voters?: VoterSpec[]; rejectionReason?: string },
  ) {
    const project = projects.get(projectSlug)!;
    const status = project.spec.studyStatus;
    if (status == null) return;

    const createdById = orgProjectManager.get(project.org.id) ?? Array.from(orgProjectManager.values())[0];
    const createdByUser = await prisma.user.findFirst({ where: { referenceType: 'admin', referenceId: createdById } });
    const approvedNow = status === StudyStatus.approved || status === StudyStatus.rejected;

    const { row: study, created } = await findOrCreate(
      () => prisma.projectStudy.findUnique({ where: { projectId: project.id } }),
      () =>
        prisma.projectStudy.create({
          data: {
            projectId: project.id,
            status,
            summary,
            publishedAt: status !== StudyStatus.draft && status !== StudyStatus.in_review ? daysAgo(120) : null,
            votingStartsAt: opts.votingStartsAt,
            votingEndsAt: opts.votingEndsAt,
            approvedById: approvedNow ? createdById : null,
            approvedByUserId: approvedNow ? boardChairUser.id : null,
            approvedAt: approvedNow ? daysAgo(60) : null,
            rejectionReason: status === StudyStatus.rejected ? opts.rejectionReason : null,
            createdById,
            createdByUserId: createdByUser?.id,
          },
        }),
    );
    if (created) c.add('studiesCreated');

    for (const section of SECTIONS) {
      const sectionStatus =
        status === StudyStatus.draft
          ? SectionStatus.pending
          : status === StudyStatus.in_review
            ? SectionStatus.in_progress
            : SectionStatus.completed;
      const { created: sectionCreated } = await findOrCreate(
        () => prisma.studySection.findFirst({ where: { studyId: study.id, name: section.name } }),
        () =>
          prisma.studySection.create({
            data: {
              studyId: study.id,
              name: section.name,
              description: `${section.name} for ${project.spec.name}.`,
              status: sectionStatus,
              order: section.order,
              isRequired: true,
              assignedTo: createdById,
              assignedToUserId: createdByUser?.id,
              completedAt: sectionStatus === SectionStatus.completed ? daysAgo(90) : null,
            },
          }),
      );
      if (sectionCreated) c.add('studySectionsCreated');
    }

    for (const voter of opts.voters ?? []) {
      const { created: voteCreated } = await findOrCreate(
        () => prisma.studyVote.findUnique({ where: { studyId_userId: { studyId: study.id, userId: voter.userId } } }),
        () => prisma.studyVote.create({ data: { studyId: study.id, userId: voter.userId, choice: voter.choice, comment: voter.comment } }),
      );
      if (voteCreated) c.add('studyVotesCreated');
    }
  }

  const [chair, member1, member2, secretary] = boardUsers;
  await buildStudy('solar-water-wells-project', 'Feasibility, technical, and financial study for five solar-powered wells. Approved by the Board.', {
    votingStartsAt: daysAgo(150),
    votingEndsAt: daysAgo(140),
    voters: [
      { userId: chair.id, choice: VoteChoice.for, comment: 'Strong community need, clear technical plan.' },
      { userId: member1.id, choice: VoteChoice.for },
      { userId: member2.id, choice: VoteChoice.for, comment: 'Budget is reasonable for five wells.' },
      { userId: secretary.id, choice: VoteChoice.abstain },
    ],
  });
  await buildStudy('rural-water-network-expansion', 'Feasibility and technical study for a 12km pipe extension in partnership with the municipality.', {
    votingStartsAt: daysAgo(3),
    votingEndsAt: undefined,
    voters: [
      { userId: chair.id, choice: VoteChoice.for },
      { userId: member1.id, choice: VoteChoice.against, comment: 'Concerned about right-of-way delays.' },
    ],
  });
  await buildStudy('school-renovation-program', 'Structural and financial study for renovating six schools. Fully funded and completed.', {
    votingStartsAt: daysAgo(290),
    votingEndsAt: daysAgo(280),
    voters: [
      { userId: chair.id, choice: VoteChoice.for },
      { userId: member1.id, choice: VoteChoice.for },
      { userId: member2.id, choice: VoteChoice.for },
    ],
  });
  await buildStudy('scholarship-program', 'Draft study outlining eligibility criteria and disbursement schedule; sections in progress.', {});
  await buildStudy('mobile-medical-clinic', 'Technical and financial study for a mobile clinic unit and its equipment. Approved by the Board.', {
    votingStartsAt: daysAgo(85),
    votingEndsAt: daysAgo(75),
    voters: [
      { userId: chair.id, choice: VoteChoice.for },
      { userId: member2.id, choice: VoteChoice.for, comment: 'Meets an urgent gap in rural primary care.' },
    ],
  });
  await buildStudy('emergency-housing-support', 'Published study; voting has not opened yet.', {});
  await buildStudy('community-food-bank-network', 'Draft study; sections not yet started.', {});
  await buildStudy('neighborhood-solar-microgrid', 'Feasibility study found the terrain unsuitable for the proposed layout; rejected by the Board.', {
    votingStartsAt: daysAgo(195),
    votingEndsAt: daysAgo(185),
    voters: [
      { userId: chair.id, choice: VoteChoice.against, comment: 'Terrain survey rules out the proposed layout.' },
      { userId: member1.id, choice: VoteChoice.against },
    ],
    rejectionReason: 'Site survey found the terrain unsuitable for the proposed panel layout; resubmission welcome with an alternate site.',
  });

  return continueDonationsAndFinance(prisma, c, {
    superAdminUser,
    boardChairUser,
    orgAccountant,
    orgFoundation,
    orgWater,
    orgEducation,
    orgMedical,
    orgMunicipality,
    orgYouth,
    orgInitiative,
    orgAdmin,
    projects,
    waterFund,
    educationFund,
    healthFund,
    housingFund,
    emergencyFund,
    foodFund,
    envFund,
    solarWellsFund,
    clinicFund,
    donorFund,
    majorDonor,
    sectorByKey,
  });
}

async function continueDonationsAndFinance(
  prisma: PrismaClient,
  c: Counter,
  ctx: {
    superAdminUser: { id: number };
    boardChairUser: { id: number };
    orgAccountant: Map<number, number>;
    orgFoundation: { id: number; name: string };
    orgWater: { id: number; name: string };
    orgEducation: { id: number; name: string };
    orgMedical: { id: number; name: string };
    orgMunicipality: { id: number; name: string };
    orgYouth: { id: number; name: string };
    orgInitiative: { id: number; name: string };
    orgAdmin: Map<number, number>;
    projects: Map<string, { id: number; blockId: number; value: number; org: { id: number; name: string }; spec: { name: string } }>;
    waterFund: { id: number; name: string };
    educationFund: { id: number; name: string };
    healthFund: { id: number; name: string };
    housingFund: { id: number; name: string };
    emergencyFund: { id: number; name: string };
    foodFund: { id: number; name: string };
    envFund: { id: number; name: string };
    solarWellsFund: { id: number; name: string };
    clinicFund: { id: number; name: string };
    donorFund: { id: number; name: string };
    majorDonor: { id: number; name: string };
    sectorByKey: Map<string, { id: number; name: string }>;
  },
): Promise<DemoSeedResult> {
  const {
    superAdminUser,
    boardChairUser,
    orgAccountant,
    orgFoundation,
    orgWater,
    orgEducation,
    orgMedical,
    orgMunicipality,
    orgYouth,
    orgInitiative,
    orgAdmin,
    projects,
    waterFund,
    educationFund,
    healthFund,
    housingFund,
    emergencyFund,
    foodFund,
    solarWellsFund,
    clinicFund,
    donorFund,
    majorDonor,
  } = ctx;

  // ═══ 8. Donations — donor participants (individuals/companies/orgs) ════════
  const individualNames: Array<[string, string]> = [
    ['Ali', 'Hassan'],
    ['Fatima', 'Nasser'],
    ['Omar', 'Khalil'],
    ['Nour', 'Saad'],
    ['Youssef', 'Ibrahim'],
    ['Rania', 'Mansour'],
    ['Karim', 'Aziz'],
    ['Dana', 'Fares'],
    ['Sami', 'Rahal'],
    ['Maya', 'Choueiri'],
  ];
  const donorParticipants: Array<{ id: number }> = [];
  for (const [first, last] of individualNames) {
    const { row, created } = await ensureParticipant(prisma, first, last, Representation.personal);
    donorParticipants.push(row);
    if (created) c.add('donorParticipantsCreated');
  }
  const { participant: loginParticipant, created: loginParticipantCreated } = await ensureParticipantWithLogin(
    prisma,
    'Ali',
    'Hassan (Registered)',
    Representation.personal,
    'participant@example.com',
  );
  donorParticipants.push(loginParticipant);
  if (loginParticipantCreated) c.add('donorParticipantsCreated');
  const companyParticipants: Array<{ id: number }> = [];
  for (const name of ['Cedar Trading Co.', 'Beirut Tech Group']) {
    const { row, created } = await ensureParticipant(prisma, name, '', Representation.company);
    companyParticipants.push(row);
    if (created) c.add('donorParticipantsCreated');
  }
  const orgParticipants: Array<{ id: number }> = [];
  for (const name of ['Rotary Club Chapter 12']) {
    const { row, created } = await ensureParticipant(prisma, name, '', Representation.organization);
    orgParticipants.push(row);
    if (created) c.add('donorParticipantsCreated');
  }
  const allDonorParticipants = [...donorParticipants, ...companyParticipants, ...orgParticipants];

  const cashAccount = await platformAccount(prisma, 'cash');
  const externalAccount = await platformAccount(prisma, 'external');
  const stripeAccount = await platformAccount(prisma, 'stripe');

  let donationSeq = 0;
  async function makeDonation(
    projectSlug: string,
    amount: number,
    status: DonationStatus,
    daysBack: number,
    approverAdminId?: number,
  ) {
    donationSeq += 1;
    const marker = MARK(`donation-${projectSlug}-${donationSeq}`);
    const project = projects.get(projectSlug)!;
    const participant = allDonorParticipants[donationSeq % allDonorParticipants.length];
    const { row: donation, created } = await findOrCreate(
      () => prisma.projectDonation.findFirst({ where: { notes: { contains: marker } } }),
      () =>
        prisma.projectDonation.create({
          data: {
            projectId: project.id,
            participantId: participant.id,
            amount: new Prisma.Decimal(amount),
            status,
            qrToken: qrToken(),
            approvedBy: status === DonationStatus.approved ? approverAdminId : undefined,
            approvedAt: status === DonationStatus.approved ? daysAgo(daysBack) : undefined,
            notes: marker,
            createdAt: daysAgo(daysBack + 1),
          },
        }),
    );
    if (!created) return donation;
    c.add('donationsCreated');

    if (status === DonationStatus.approved) {
      await prisma.projectTransaction.create({
        data: {
          projectId: project.blockId,
          projectRefId: project.id,
          type: 'income',
          amount: new Prisma.Decimal(amount),
          referenceType: 'donation',
          referenceId: donation.id,
          notes: `Demo cash/QR donation approved (${marker})`,
          createdAt: daysAgo(daysBack),
        },
      });
    }
    return donation;
  }

  const waterOfficer = orgAccountant.get(orgWater.id)!;
  const eduOfficer = orgAccountant.get(orgEducation.id)!;
  const medOfficer = orgAccountant.get(orgMedical.id)!;
  const foundationOfficer = orgAccountant.get(orgFoundation.id)!;

  const donationPlan: Array<[string, number, DonationStatus, number, number]> = [
    ['solar-water-wells-project', 15000, DonationStatus.approved, 140, waterOfficer],
    ['solar-water-wells-project', 8000, DonationStatus.approved, 100, waterOfficer],
    ['solar-water-wells-project', 22000, DonationStatus.approved, 60, waterOfficer],
    ['solar-water-wells-project', 12500, DonationStatus.approved, 20, waterOfficer],
    ['solar-water-wells-project', 5000, DonationStatus.pending, 2, waterOfficer],
    ['rural-water-network-expansion', 9000, DonationStatus.approved, 15, waterOfficer],
    ['rural-water-network-expansion', 4000, DonationStatus.pending, 3, waterOfficer],
    ['rural-water-network-expansion', 1500, DonationStatus.rejected, 10, waterOfficer],
    ['school-renovation-program', 25000, DonationStatus.approved, 280, eduOfficer],
    ['school-renovation-program', 20000, DonationStatus.approved, 220, eduOfficer],
    ['school-renovation-program', 15000, DonationStatus.approved, 150, eduOfficer],
    ['scholarship-program', 6000, DonationStatus.pending, 4, eduOfficer],
    ['mobile-medical-clinic', 30000, DonationStatus.approved, 80, medOfficer],
    ['mobile-medical-clinic', 18000, DonationStatus.approved, 40, medOfficer],
    ['mobile-medical-clinic', 9500, DonationStatus.approved, 12, medOfficer],
    ['mobile-medical-clinic', 3000, DonationStatus.pending, 1, medOfficer],
    ['emergency-housing-support', 7000, DonationStatus.pending, 1, foundationOfficer],
  ];
  for (const [slug, amount, status, daysBack, approver] of donationPlan) {
    await makeDonation(slug, amount, status, daysBack, approver);
  }

  // A couple of online (Stripe/PayPal) donations — read directly by the
  // transparency layer's intakeByChannel, independent of the legacy ledger.
  async function makeOnlineDonation(projectSlug: string | null, fundId: number | null, amount: number, provider: PaymentProvider, status: PaymentStatus, daysBack: number) {
    const marker = `demo-${projectSlug ?? 'fund'}-${provider}-${amount}-${daysBack}`;
    const { created } = await findOrCreate(
      () => prisma.onlineDonation.findFirst({ where: { providerSessionId: marker } }),
      () =>
        prisma.onlineDonation.create({
          data: {
            projectId: projectSlug ? projects.get(projectSlug)!.id : null,
            fundId,
            participantId: allDonorParticipants[0].id,
            amount: new Prisma.Decimal(amount),
            currency: 'USD',
            provider,
            providerSessionId: marker,
            providerPaymentId: status === PaymentStatus.completed ? `${marker}-pi` : null,
            status,
            paidAt: status === PaymentStatus.completed ? daysAgo(daysBack) : null,
            createdAt: daysAgo(daysBack + 1),
          },
        }),
    );
    if (created) c.add('onlineDonationsCreated');
  }
  await makeOnlineDonation('solar-water-wells-project', null, 4000, PaymentProvider.stripe, PaymentStatus.completed, 55);
  await makeOnlineDonation('mobile-medical-clinic', null, 2500, PaymentProvider.paypal, PaymentStatus.completed, 30);
  await makeOnlineDonation(null, emergencyFund.id, 6000, PaymentProvider.stripe, PaymentStatus.completed, 25);
  await makeOnlineDonation('scholarship-program', null, 1200, PaymentProvider.stripe, PaymentStatus.pending, 2);

  const onlineFundDonation = await prisma.onlineDonation.findFirst({ where: { fundId: emergencyFund.id, status: PaymentStatus.completed } });
  if (onlineFundDonation) {
    const fundAcc = await fundAccount(prisma, emergencyFund.id, emergencyFund.name);
    await postLedger(prisma, {
      description: `Fund-directed online donation #${onlineFundDonation.id} (${onlineFundDonation.provider})`,
      referenceType: 'online_donation',
      referenceId: onlineFundDonation.id,
      event: 'payment.completed',
      entries: [
        { accountId: stripeAccount.id, direction: 'debit', amount: Number(onlineFundDonation.amount) },
        { accountId: fundAcc.id, direction: 'credit', amount: Number(onlineFundDonation.amount) },
      ],
      timestamp: onlineFundDonation.paidAt ?? undefined,
    });
  }

  // Reconstruct each project's ledger from the ProjectTransaction rows just
  // written, BEFORE anything below posts a fund_allocation entry against a
  // project account — backfillTreasury only reconstructs accounts with zero
  // prior ledger activity, so this order is load-bearing (see w5 backfill).
  const donationsReconciliation = await backfillTreasury(prisma);
  if (donationsReconciliation.reconciliation.mismatches.length > 0) {
    throw new Error(`Donation ledger reconstruction failed: ${donationsReconciliation.reconciliation.mismatches.join('; ')}`);
  }

  // ═══ 9. Expenses (recipients, invoices, expenses — new fund-based model) ═══
  async function ensureRecipient(name: string, type: PartyType, organizationId?: number) {
    const { row, created } = await findOrCreate(
      () => prisma.recipient.findFirst({ where: { name, type } }),
      () => prisma.recipient.create({ data: { name, type, organizationId, createdByUserId: superAdminUser.id } }),
    );
    if (created) c.add('recipientsCreated');
    return row;
  }
  const materialsSupplier = await ensureRecipient('Levant Building Materials Co.', PartyType.company);
  const laborContractor = await ensureRecipient('Cedar Construction Crew', PartyType.company);
  const transportCo = await ensureRecipient('Highland Logistics & Transport', PartyType.company);
  const servicesProvider = await ensureRecipient('Al-Baraka Engineering Services', PartyType.company);
  const medicalSupplier = await ensureRecipient('MedSupply Regional Distributors', PartyType.company);

  interface ExpenseSpec {
    projectSlug: string;
    fund: { id: number; name: string };
    amount: number;
    category: ExpenseCategory;
    description: string;
    recipient: { id: number };
    approved: boolean;
    daysBack: number;
  }
  const expenseSpecs: ExpenseSpec[] = [
    { projectSlug: 'solar-water-wells-project', fund: solarWellsFund, amount: 18000, category: ExpenseCategory.materials, description: 'Solar panels, pumps, and piping for two wells.', recipient: materialsSupplier, approved: true, daysBack: 90 },
    { projectSlug: 'solar-water-wells-project', fund: solarWellsFund, amount: 12000, category: ExpenseCategory.labor, description: 'Drilling and installation crew, phase 1.', recipient: laborContractor, approved: true, daysBack: 75 },
    { projectSlug: 'solar-water-wells-project', fund: solarWellsFund, amount: 3200, category: ExpenseCategory.transport, description: 'Equipment transport to well sites.', recipient: transportCo, approved: true, daysBack: 70 },
    { projectSlug: 'solar-water-wells-project', fund: waterFund, amount: 2500, category: ExpenseCategory.services, description: 'Site engineering survey.', recipient: servicesProvider, approved: false, daysBack: 5 },
    { projectSlug: 'school-renovation-program', fund: educationFund, amount: 22000, category: ExpenseCategory.materials, description: 'Roofing, flooring, and sanitation fixtures for six schools.', recipient: materialsSupplier, approved: true, daysBack: 200 },
    { projectSlug: 'school-renovation-program', fund: educationFund, amount: 15000, category: ExpenseCategory.labor, description: 'Renovation crew across six school sites.', recipient: laborContractor, approved: true, daysBack: 180 },
    { projectSlug: 'school-renovation-program', fund: educationFund, amount: 4000, category: ExpenseCategory.administrative, description: 'Permits and inspection fees.', recipient: servicesProvider, approved: true, daysBack: 190 },
    { projectSlug: 'mobile-medical-clinic', fund: clinicFund, amount: 28000, category: ExpenseCategory.equipment, description: 'Diagnostic and vaccination equipment for the mobile unit.', recipient: medicalSupplier, approved: true, daysBack: 60 },
    { projectSlug: 'mobile-medical-clinic', fund: clinicFund, amount: 14000, category: ExpenseCategory.services, description: 'Vehicle retrofit and medical-grade fittings.', recipient: servicesProvider, approved: true, daysBack: 50 },
    { projectSlug: 'mobile-medical-clinic', fund: healthFund, amount: 3600, category: ExpenseCategory.transport, description: 'Fuel and logistics for outreach circuit, month 1.', recipient: transportCo, approved: false, daysBack: 8 },
  ];

  let expenseSeq = 0;
  for (const spec of expenseSpecs) {
    expenseSeq += 1;
    const marker = MARK(`expense-${expenseSeq}`);
    const project = projects.get(spec.projectSlug)!;
    const approverId = orgAccountant.get(project.org.id);
    const { row: expense, created } = await findOrCreate(
      () => prisma.expense.findFirst({ where: { notes: { contains: marker } } }),
      () =>
        prisma.expense.create({
          data: {
            fundId: spec.fund.id,
            projectId: project.id,
            amount: new Prisma.Decimal(spec.amount),
            category: spec.category,
            description: spec.description,
            recipientId: spec.recipient.id,
            status: spec.approved ? 'approved' : 'pending',
            createdByUserId: approverId!,
            approvedByUserId: spec.approved ? approverId : undefined,
            approvedAt: spec.approved ? daysAgo(spec.daysBack) : undefined,
            paidAt: spec.approved ? daysAgo(Math.max(spec.daysBack - 2, 0)) : undefined,
            stage: spec.approved ? ExecutionStage.execution : ExecutionStage.procurement,
            notes: marker,
            createdAt: daysAgo(spec.daysBack + 1),
          },
        }),
    );
    if (!created) continue;
    c.add('expensesCreated');

    if (spec.approved) {
      const fundAcc = await fundAccount(prisma, spec.fund.id, spec.fund.name);
      await postLedger(prisma, {
        description: `Expense #${expense.id} approved: ${spec.description}`,
        referenceType: 'expense',
        referenceId: expense.id,
        event: 'expense.approved',
        entries: [
          { accountId: fundAcc.id, direction: 'debit', amount: spec.amount },
          { accountId: externalAccount.id, direction: 'credit', amount: spec.amount },
        ],
        timestamp: daysAgo(spec.daysBack),
      });
    }
  }

  // ═══ 4b. Fund allocations (fund → project financing/co-funding) ═══════════
  interface AllocationSpec {
    fund: { id: number; name: string };
    projectSlug: string;
    amount: number;
    status: 'proposed' | 'board_approved' | 'reconciled';
    daysBack: number;
  }
  const allocationSpecs: AllocationSpec[] = [
    { fund: waterFund, projectSlug: 'rural-water-network-expansion', amount: 25000, status: 'reconciled', daysBack: 12 },
    { fund: emergencyFund, projectSlug: 'emergency-housing-support', amount: 30000, status: 'board_approved', daysBack: 4 },
    { fund: healthFund, projectSlug: 'mobile-medical-clinic', amount: 15000, status: 'reconciled', daysBack: 35 },
    { fund: foodFund, projectSlug: 'community-food-bank-network', amount: 10000, status: 'proposed', daysBack: 1 },
  ];
  let allocSeq = 0;
  for (const spec of allocationSpecs) {
    allocSeq += 1;
    const marker = MARK(`allocation-${allocSeq}`);
    const project = projects.get(spec.projectSlug)!;
    const { row: allocation, created } = await findOrCreate(
      () => prisma.fundAllocation.findFirst({ where: { note: { contains: marker } } }),
      () =>
        prisma.fundAllocation.create({
          data: {
            fundId: spec.fund.id,
            projectId: project.id,
            amount: new Prisma.Decimal(spec.amount),
            status: spec.status,
            note: `Co-financing tranche for ${project.spec.name}. ${marker}`,
            createdByUserId: superAdminUser.id,
          },
        }),
    );
    if (!created) continue;
    c.add('fundAllocationsCreated');

    if (spec.status === 'board_approved' || spec.status === 'reconciled') {
      const decision = await prisma.boardDecision.create({
        data: {
          subjectType: GovernanceSubjectType.fund_allocation,
          subjectId: allocation.id,
          decision: 'approved',
          rationale: `Board approves co-financing tranche of $${spec.amount.toLocaleString()} from ${spec.fund.name} to ${project.spec.name}.`,
          decidedById: boardChairUser.id,
          decidedAt: daysAgo(spec.daysBack + 1),
        },
      });
      await prisma.fundAllocation.update({ where: { id: allocation.id }, data: { approvedByDecisionId: decision.id } });
      c.add('boardDecisionsCreated');
    }
    if (spec.status === 'reconciled') {
      const [fundAcc, projectAcc] = await Promise.all([
        fundAccount(prisma, spec.fund.id, spec.fund.name),
        ensureAccount(prisma, 'project', project.id, `Project #${project.id}`, 'liability'),
      ]);
      await postLedger(prisma, {
        description: `Allocation #${allocation.id}: ${spec.fund.name} → ${project.spec.name}`,
        referenceType: 'fund_allocation',
        referenceId: allocation.id,
        event: 'tranche.1.seed',
        entries: [
          { accountId: fundAcc.id, direction: 'debit', amount: spec.amount },
          { accountId: projectAcc.id, direction: 'credit', amount: spec.amount },
        ],
        timestamp: daysAgo(spec.daysBack),
      });
    }
  }

  // ═══ 4c. Fund donations (Donor → Fund directly, Wave 8) ════════════════════
  const donorSpecs: Array<{ name: string; type: PartyType; email?: string }> = [
    { name: 'Sarah Mitchell', type: PartyType.person, email: 'sarah.mitchell.donor@example.com' },
    { name: 'Tarek Zindin', type: PartyType.person },
    { name: 'Beirut Merchants Association', type: PartyType.organization },
    { name: 'Global Relief Partners', type: PartyType.organization },
    { name: 'Sunrise Family Trust', type: PartyType.person },
    { name: 'Horizon Freight Co.', type: PartyType.company },
  ];
  const donors: Array<{ id: number; name: string }> = [majorDonor];
  for (const spec of donorSpecs) {
    const { row, created } = await findOrCreate(
      () => prisma.donor.findFirst({ where: { name: spec.name, type: spec.type } }),
      () => prisma.donor.create({ data: { name: spec.name, type: spec.type, contactEmail: spec.email, createdByUserId: superAdminUser.id } }),
    );
    if (created) c.add('donorsCreated');
    donors.push(row);
  }

  interface FundDonationSpec {
    donor: { id: number; name: string };
    fund: { id: number; name: string };
    amount: number;
    method: FundDonationMethod;
    approved: boolean;
    daysBack: number;
  }
  // Amounts are sized to comfortably cover every approved/reconciled expense
  // and allocation drawn from the same fund elsewhere in this seed (see the
  // expenseSpecs and allocationSpecs above) — funds should read as solvent,
  // not overdrawn, right after a fresh seed.
  const fundDonationSpecs: FundDonationSpec[] = [
    { donor: donors[1], fund: emergencyFund, amount: 20000, method: FundDonationMethod.bank_transfer, approved: true, daysBack: 45 },
    { donor: donors[2], fund: waterFund, amount: 30000, method: FundDonationMethod.check, approved: true, daysBack: 30 },
    { donor: donors[3], fund: educationFund, amount: 45000, method: FundDonationMethod.bank_transfer, approved: true, daysBack: 20 },
    { donor: donors[4], fund: foodFund, amount: 5000, method: FundDonationMethod.online, approved: true, daysBack: 10 },
    { donor: donors[5], fund: healthFund, amount: 20000, method: FundDonationMethod.cash, approved: true, daysBack: 5 },
    { donor: donors[0], fund: donorFund, amount: 50000, method: FundDonationMethod.bank_transfer, approved: true, daysBack: 100 },
    { donor: donors[6], fund: emergencyFund, amount: 3000, method: FundDonationMethod.card, approved: false, daysBack: 1 },
    { donor: donors[1], fund: solarWellsFund, amount: 38000, method: FundDonationMethod.bank_transfer, approved: true, daysBack: 95 },
    { donor: donors[3], fund: clinicFund, amount: 48000, method: FundDonationMethod.bank_transfer, approved: true, daysBack: 65 },
  ];
  let fdSeq = 0;
  for (const spec of fundDonationSpecs) {
    fdSeq += 1;
    const marker = MARK(`funddonation-${fdSeq}`);
    const creatorId = orgAccountant.get(orgFoundation.id)!;
    const { row: fd, created } = await findOrCreate(
      () => prisma.fundDonation.findFirst({ where: { referenceNumber: marker } }),
      () =>
        prisma.fundDonation.create({
          data: {
            fundId: spec.fund.id,
            donorId: spec.donor.id,
            amount: new Prisma.Decimal(spec.amount),
            currency: 'USD',
            paymentMethod: spec.method,
            referenceNumber: marker,
            donatedAt: daysAgo(spec.daysBack + 1),
            status: spec.approved ? DonationStatus.approved : DonationStatus.pending,
            createdByUserId: creatorId,
            approvedByUserId: spec.approved ? boardChairUser.id : undefined,
            approvedAt: spec.approved ? daysAgo(spec.daysBack) : undefined,
          },
        }),
    );
    if (!created) continue;
    c.add('fundDonationsCreated');

    if (spec.approved) {
      const fundAcc = await fundAccount(prisma, spec.fund.id, spec.fund.name);
      await postLedger(prisma, {
        description: `Fund donation #${fd.id} confirmed from ${spec.donor.name}`,
        referenceType: 'fund_donation',
        referenceId: fd.id,
        event: 'fund_donation.approved',
        entries: [
          { accountId: cashAccount.id, direction: 'debit', amount: spec.amount },
          { accountId: fundAcc.id, direction: 'credit', amount: spec.amount },
        ],
        timestamp: daysAgo(spec.daysBack),
      });
    }
  }

  return continueReportsAndContent(prisma, c, {
    superAdminUser,
    boardChairUser,
    orgFoundation,
    orgWater,
    orgEducation,
    orgMedical,
    orgMunicipality,
    orgYouth,
    orgInitiative,
    orgAdmin,
    orgAccountant,
    projects,
    housingFund,
    waterFund,
  });
}

async function continueReportsAndContent(
  prisma: PrismaClient,
  c: Counter,
  ctx: {
    superAdminUser: { id: number };
    boardChairUser: { id: number };
    orgFoundation: { id: number; name: string };
    orgWater: { id: number; name: string };
    orgEducation: { id: number; name: string };
    orgMedical: { id: number; name: string };
    orgMunicipality: { id: number; name: string };
    orgYouth: { id: number; name: string };
    orgInitiative: { id: number; name: string };
    orgAdmin: Map<number, number>;
    orgAccountant: Map<number, number>;
    projects: Map<string, { id: number; blockId: number; value: number; org: { id: number; name: string }; spec: { name: string } }>;
    housingFund: { id: number; name: string };
    waterFund: { id: number; name: string };
  },
): Promise<DemoSeedResult> {
  const { superAdminUser, boardChairUser, orgFoundation, orgWater, orgEducation, orgMedical, orgMunicipality, orgAdmin, orgAccountant, projects, housingFund, waterFund } = ctx;

  // ═══ 10. Reports (progress + financial, per major org) ═════════════════════
  interface ReportSpec {
    org: { id: number; name: string };
    type: OrgReportType;
    title: string;
    projectSlug?: string;
    status: OrgReportStatus;
    payload: Record<string, unknown>;
    daysBack: number;
  }
  const reportSpecs: ReportSpec[] = [
    {
      org: orgWater,
      type: OrgReportType.progress,
      title: 'Q2 2026 Progress Report — Solar Water Wells Project',
      projectSlug: 'solar-water-wells-project',
      status: OrgReportStatus.accepted,
      payload: { wellsCompleted: 3, wellsPlanned: 5, beneficiaries: 1800, narrative: 'Three of five wells are operational; remaining two are in the drilling phase.' },
      daysBack: 30,
    },
    {
      org: orgWater,
      type: OrgReportType.financial,
      title: 'Q2 2026 Financial Report — Clean Water Initiative',
      status: OrgReportStatus.accepted,
      payload: { totalReceived: 61500, totalSpent: 33200, remainingBalance: 28300 },
      daysBack: 28,
    },
    {
      org: orgEducation,
      type: OrgReportType.progress,
      title: 'School Renovation Program — Completion Report',
      projectSlug: 'school-renovation-program',
      status: OrgReportStatus.accepted,
      payload: { schoolsCompleted: 6, schoolsPlanned: 6, students: 2400, narrative: 'All six schools renovated and reopened ahead of the new school year.' },
      daysBack: 25,
    },
    {
      org: orgMedical,
      type: OrgReportType.progress,
      title: 'Mobile Medical Clinic — Month 3 Progress Report',
      projectSlug: 'mobile-medical-clinic',
      status: OrgReportStatus.under_review,
      payload: { patientsServed: 640, sitesVisited: 9, narrative: 'Clinic vehicle retrofit complete; outreach circuit began this month.' },
      daysBack: 6,
    },
    {
      org: orgMedical,
      type: OrgReportType.financial,
      title: 'Q2 2026 Financial Report — Medical Support Organization',
      status: OrgReportStatus.submitted,
      payload: { totalReceived: 60500, totalSpent: 42000, remainingBalance: 18500 },
      daysBack: 3,
    },
    {
      org: orgFoundation,
      type: OrgReportType.financial,
      title: 'Q2 2026 Financial Report — HelpingHands Foundation',
      status: OrgReportStatus.accepted,
      payload: { totalReceived: 96000, totalSpent: 41000, remainingBalance: 55000 },
      daysBack: 15,
    },
  ];
  for (const spec of reportSpecs) {
    const submittedByUserId = orgAccountant.get(spec.org.id) ?? orgAdmin.get(spec.org.id);
    const submittedByUser = await prisma.user.findFirst({ where: { referenceType: 'admin', referenceId: submittedByUserId } });
    const { created } = await findOrCreate(
      () => prisma.organizationReport.findFirst({ where: { title: spec.title, organizationId: spec.org.id } }),
      () =>
        prisma.organizationReport.create({
          data: {
            type: spec.type,
            organizationId: spec.org.id,
            projectId: spec.projectSlug ? projects.get(spec.projectSlug)!.id : undefined,
            title: spec.title,
            periodStart: daysAgo(spec.daysBack + 90),
            periodEnd: daysAgo(spec.daysBack),
            payload: spec.payload as Prisma.InputJsonValue,
            status: spec.status,
            submittedByUserId: submittedByUser?.id,
            submittedAt: daysAgo(spec.daysBack),
            reviewedByUserId: spec.status === OrgReportStatus.accepted ? boardChairUser.id : undefined,
            reviewedAt: spec.status === OrgReportStatus.accepted ? daysAgo(Math.max(spec.daysBack - 2, 0)) : undefined,
            reviewNote: spec.status === OrgReportStatus.accepted ? 'Reviewed and accepted by the Board.' : undefined,
          },
        }),
    );
    if (created) c.add('organizationReportsCreated');
  }

  // ═══ 6b. Funding agreements (municipal channel) ═════════════════════════════
  interface AgreementSpec {
    fund: { id: number; name: string };
    org: { id: number; name: string };
    title: string;
    daysBack: number;
  }
  const agreementSpecs: AgreementSpec[] = [
    { fund: waterFund, org: orgMunicipality, title: 'Rural Water Network Expansion — Municipal Co-Funding Agreement', daysBack: 25 },
    { fund: housingFund, org: orgMunicipality, title: 'Emergency Housing Support — Municipal Partnership Agreement', daysBack: 10 },
  ];
  for (const spec of agreementSpecs) {
    const { row: agreement, created } = await findOrCreate(
      () => prisma.fundingAgreement.findFirst({ where: { title: spec.title } }),
      () =>
        prisma.fundingAgreement.create({
          data: {
            fundId: spec.fund.id,
            organizationId: spec.org.id,
            title: spec.title,
            terms: { blockDisbursementsOnOverdueReports: true, graceDays: 14 } as Prisma.InputJsonValue,
            reportingSchedule: { frequency: 'quarterly', reportTypes: ['progress', 'financial'] } as Prisma.InputJsonValue,
            status: FundingAgreementStatus.active,
            signedAt: daysAgo(spec.daysBack),
            startsAt: daysAgo(spec.daysBack),
            createdByUserId: superAdminUser.id,
          },
        }),
    );
    if (created) c.add('fundingAgreementsCreated');
  }

  // ═══ 12. Website content ═════════════════════════════════════════════════════
  const aboutBlocks: BlockSpec[] = [
    {
      category: BlockCategory.about_us,
      classification: 'about',
      slug: 'about-helpinghands',
      slugAr: 'aan-helpinghands',
      name: 'About HelpingHands',
      nameAr: 'عن هيلبينج هاندز',
      brief: 'A transparent, community-driven donation platform',
      briefAr: 'منصة تبرعات شفافة يقودها المجتمع',
      description:
        'HelpingHands connects donors directly with verified NGOs, municipalities, and community initiatives. Every donation, expense, and project milestone is tracked and independently auditable.',
      descriptionAr: 'تربط هيلبينج هاندز المانحين مباشرة بمنظمات غير حكومية وبلديات ومبادرات مجتمعية موثقة. كل تبرع ونفقة وإنجاز مشروع موثق وقابل للتدقيق.',
      imageSeed: 'about-us',
      orderId: 1,
    },
    {
      category: BlockCategory.about_us,
      classification: 'mission',
      slug: 'our-vision',
      slugAr: 'ruyatouna',
      name: 'Our Vision',
      nameAr: 'رؤيتنا',
      brief: 'A future where every community can fund its own priorities',
      briefAr: 'مستقبل يمكن فيه لكل مجتمع تمويل أولوياته الخاصة',
      description:
        'We envision a platform where local organizations propose, fund, and execute the projects their communities need most — with full financial transparency from the first donation to the final receipt.',
      descriptionAr: 'نتصور منصة تقترح فيها المنظمات المحلية وتموّل وتنفذ المشاريع التي تحتاجها مجتمعاتها، مع شفافية مالية كاملة من أول تبرع إلى آخر إيصال.',
      imageSeed: 'our-vision',
      orderId: 2,
    },
    {
      category: BlockCategory.about_us,
      classification: 'impact',
      slug: 'our-impact',
      slugAr: 'atharouna',
      name: 'Our Impact',
      nameAr: 'أثرنا',
      brief: 'Platform-wide impact statistics',
      briefAr: 'إحصائيات الأثر على مستوى المنصة',
      description:
        '8 active projects across 5 sectors, 7 partner organizations, over $180,000 in tracked donations, and more than 4,000 direct beneficiaries reached since launch.',
      descriptionAr: '8 مشاريع نشطة في 5 قطاعات، 7 منظمات شريكة، أكثر من 180,000 دولار من التبرعات الموثقة، وأكثر من 4000 مستفيد مباشر منذ الإطلاق.',
      imageSeed: 'our-impact',
      orderId: 3,
    },
  ];

  const testimonialBlocks: BlockSpec[] = [
    {
      category: BlockCategory.blog,
      classification: 'testimonial',
      slug: 'testimonial-fatima',
      slugAr: 'shahada-fatima',
      name: 'Fatima N., Beneficiary — Solar Water Wells Project',
      nameAr: 'فاطمة ن.، مستفيدة — مشروع آبار المياه الشمسية',
      brief: '“Our village finally has clean water year-round.”',
      briefAr: '"أخيراً أصبح لدى قريتنا مياه نظيفة على مدار العام."',
      description:
        'Before this project, we spent hours each day fetching water from a truck that didn’t always come. Now the well is right in our village and it never runs dry.',
      descriptionAr: 'قبل هذا المشروع، كنا نقضي ساعات يومياً لجلب المياه من شاحنة لا تأتي دائماً. الآن البئر في قريتنا مباشرة ولا ينضب أبداً.',
      imageSeed: 'testimonial-1',
    },
    {
      category: BlockCategory.blog,
      classification: 'testimonial',
      slug: 'testimonial-donor-sarah',
      slugAr: 'shahada-mutabarrie-sarah',
      name: 'Sarah M., Monthly Donor',
      nameAr: 'سارة م.، متبرعة شهرية',
      brief: '“I can see exactly where my donation goes.”',
      briefAr: '"أستطيع أن أرى بالضبط أين يذهب تبرعي."',
      description:
        'What convinced me to keep giving is the transparency — every expense is itemized against the project it funded. I have never seen that level of detail on a donation platform before.',
      descriptionAr: 'ما أقنعني بالاستمرار في التبرع هو الشفافية — كل نفقة مفصلة مقابل المشروع الذي مولته. لم أرَ هذا المستوى من التفاصيل من قبل.',
      imageSeed: 'testimonial-2',
    },
    {
      category: BlockCategory.blog,
      classification: 'testimonial',
      slug: 'testimonial-principal',
      slugAr: 'shahada-mudir-madrasa',
      name: 'Karim A., School Principal',
      nameAr: 'كريم أ.، مدير مدرسة',
      brief: '“Our students returned to real classrooms.”',
      briefAr: '"عاد طلابنا إلى فصول دراسية حقيقية."',
      description:
        'The renovation gave us working sanitation and safe roofing for the first time in years. Enrollment is already up for the new term.',
      descriptionAr: 'منحنا الترميم مرافق صحية عاملة وأسقفاً آمنة لأول مرة منذ سنوات. ارتفع عدد المسجلين بالفعل للفصل الدراسي الجديد.',
      imageSeed: 'testimonial-3',
    },
  ];

  const faqBlocks: BlockSpec[] = [
    {
      category: BlockCategory.blog,
      classification: 'faq',
      slug: 'faq-how-donations-tracked',
      slugAr: 'faq-kayfa-tutabaa-al-tabarruaat',
      name: 'How are my donations tracked?',
      nameAr: 'كيف يتم تتبع تبرعاتي؟',
      brief: 'Every donation is linked to a project and a verifiable expense trail.',
      briefAr: 'كل تبرع مرتبط بمشروع ومسار نفقات قابل للتحقق.',
      description:
        'Every donation is recorded against a specific project or fund. Once approved, funds are tracked through disbursement and matched against itemized, categorized expenses — all visible on the project page.',
      descriptionAr: 'يتم تسجيل كل تبرع مقابل مشروع أو صندوق محدد. بعد الموافقة، يتم تتبع الأموال عبر الصرف ومطابقتها مع نفقات مفصلة وموزعة حسب الفئة، وكلها مرئية على صفحة المشروع.',
      imageSeed: 'faq-1',
    },
    {
      category: BlockCategory.blog,
      classification: 'faq',
      slug: 'faq-cash-donation',
      slugAr: 'faq-tabarru-naqdi',
      name: 'Can I donate cash in person?',
      nameAr: 'هل يمكنني التبرع نقداً شخصياً؟',
      brief: 'Yes — hand cash to a verified employee and scan the QR receipt.',
      briefAr: 'نعم — سلّم النقد لموظف معتمد وامسح إيصال QR.',
      description:
        'Cash donations are accepted in person. You receive a QR-coded receipt immediately; the donation appears as "pending" until a second staff member verifies and approves it.',
      descriptionAr: 'يتم قبول التبرعات النقدية شخصياً. تحصل على إيصال برمز QR فوراً؛ يظهر التبرع كـ "قيد الانتظار" حتى يتحقق منه ويوافق عليه موظف آخر.',
      imageSeed: 'faq-2',
    },
    {
      category: BlockCategory.blog,
      classification: 'faq',
      slug: 'faq-org-registration',
      slugAr: 'faq-tasjeel-monazama',
      name: 'How does an organization join the platform?',
      nameAr: 'كيف تنضم منظمة إلى المنصة؟',
      brief: 'Municipalities and youth teams can self-register; the Board verifies.',
      briefAr: 'يمكن للبلديات والفرق الشبابية التسجيل الذاتي؛ يتحقق المجلس من الطلب.',
      description:
        'Municipalities and youth teams can register directly with official documents on file. A Board member reviews the registration and activates the organization with its default capabilities.',
      descriptionAr: 'يمكن للبلديات والفرق الشبابية التسجيل مباشرة مع تقديم المستندات الرسمية. يراجع أحد أعضاء المجلس التسجيل وينشط المنظمة بصلاحياتها الافتراضية.',
      imageSeed: 'faq-3',
    },
    {
      category: BlockCategory.blog,
      classification: 'faq',
      slug: 'faq-project-approval',
      slugAr: 'faq-mowafaqat-al-mashrou',
      name: 'How are projects approved?',
      nameAr: 'كيف تتم الموافقة على المشاريع؟',
      brief: 'A feasibility study, public voting, and a final Board decision.',
      briefAr: 'دراسة جدوى، تصويت عام، وقرار نهائي من المجلس.',
      description:
        'Every project moves through a feasibility/technical/financial study, an open voting period for registered users, and a final Board decision recorded permanently against the project.',
      descriptionAr: 'يمر كل مشروع بدراسة جدوى/تقنية/مالية، وفترة تصويت مفتوحة للمستخدمين المسجلين، وقرار نهائي من المجلس يُسجل بشكل دائم مقابل المشروع.',
      imageSeed: 'faq-4',
    },
  ];

  for (const spec of [...aboutBlocks, ...testimonialBlocks, ...faqBlocks]) {
    const { created } = await ensureBlock(prisma, spec);
    if (created) c.add('contentBlocksCreated');
  }

  // A couple of news posts for homepage richness
  const newsBlocks: BlockSpec[] = [
    {
      category: BlockCategory.news,
      slug: 'news-third-well-online',
      slugAr: 'akhbar-al-bir-al-thalith',
      name: 'Third solar well brings clean water to 600 more residents',
      nameAr: 'البئر الشمسي الثالث يوفر مياهاً نظيفة لـ 600 مقيم إضافي',
      brief: 'Milestone reached on the Solar Water Wells Project',
      briefAr: 'إنجاز جديد في مشروع آبار المياه الشمسية',
      description:
        'The third of five planned solar-powered wells came online this month, bringing clean water access to an additional 600 residents in the Beqaa Valley.',
      descriptionAr: 'دخل ثالث بئر من أصل خمسة آبار مخطط لها بالطاقة الشمسية الخدمة هذا الشهر، ليوفر مياهاً نظيفة لـ 600 مقيم إضافي في سهل البقاع.',
      imageSeed: 'news-1',
      orderId: 1,
    },
    {
      category: BlockCategory.news,
      slug: 'news-schools-reopen',
      slugAr: 'akhbar-eadat-fath-al-madaris',
      name: 'Six renovated schools reopen ahead of the new term',
      nameAr: 'إعادة افتتاح ست مدارس مرممة قبل الفصل الدراسي الجديد',
      brief: 'School Renovation Program reaches full completion',
      briefAr: 'برنامج ترميم المدارس يصل إلى الاكتمال الكامل',
      description:
        'All six schools in the renovation program reopened this week with new roofing, sanitation facilities, and classrooms — serving over 2,400 students.',
      descriptionAr: 'أعادت جميع المدارس الست في برنامج الترميم فتح أبوابها هذا الأسبوع بأسقف ومرافق صحية وفصول دراسية جديدة، لتخدم أكثر من 2400 طالب.',
      imageSeed: 'news-2',
      orderId: 2,
    },
  ];
  for (const spec of newsBlocks) {
    const { created } = await ensureBlock(prisma, spec);
    if (created) c.add('contentBlocksCreated');
  }

  return { counts: c.toObject() };
}
