import { Test } from '@nestjs/testing';
import { PolicyService } from './policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CATALOG } from './role-catalog';
import { PolicyActor } from './policy.types';

const mockPrisma = {
  roleAssignment: { findMany: jest.fn() },
  project: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
};

const actor = (referenceType = 'admin'): PolicyActor => ({
  userId: 7,
  referenceType,
  requestId: 'unit',
  ip: null,
});

const grant = (role: string, scopeType: string, scopeId: number | null = null) => ({
  id: 1,
  userId: 7,
  role,
  scopeType,
  scopeId,
  grantedBy: null,
  grantedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  deletedBy: null,
});

describe('PolicyService (W1-E4-S1)', () => {
  let policy: PolicyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.project.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [PolicyService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    policy = moduleRef.get(PolicyService);
  });

  it('denies anonymous actors with a reason', async () => {
    const decision = await policy.can(null, 'donation.decide');
    expect(decision).toEqual({
      allow: false,
      action: 'donation.decide',
      reason: 'denied:unauthenticated',
    });
  });

  it('denies unknown actions without a legacy fallback', async () => {
    const decision = await policy.can(actor(), 'not.registered');
    expect(decision.reason).toBe('denied:unknown-action');
  });

  describe('catalog role matrix — organization scope vs donation.decide / expense.decide', () => {
    const expectations: Record<string, { donation: boolean; expense: boolean }> = {
      org_admin: { donation: true, expense: true },
      project_manager: { donation: false, expense: false },
      staff: { donation: true, expense: false },
      org_accountant: { donation: true, expense: true },
      viewer: { donation: false, expense: false },
    };

    it.each(ROLE_CATALOG.organization.map((role) => [role] as [string]))('%s', async (role) => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant(role, 'organization', 1)]);

      const donation = await policy.can(actor(), 'donation.decide');
      const expense = await policy.can(actor(), 'expense.decide');
      expect(donation.allow).toBe(expectations[role].donation);
      expect(expense.allow).toBe(expectations[role].expense);
      if (donation.allow) expect(donation.reason).toBe(`granted:${role}@organization:1`);
      else expect(donation.reason).toBe('denied:no-matching-grant');
    });
  });

  describe('catalog role matrix — platform scope vs organization.capability.set', () => {
    const allowed = new Set(['board_chair']);

    it.each(ROLE_CATALOG.platform.map((role) => [role] as [string]))('%s', async (role) => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant(role, 'platform')]);
      const decision = await policy.can(actor(), 'organization.capability.set');
      expect(decision.allow).toBe(allowed.has(role));
    });
  });

  describe('catalog role matrix — fund and project roles hold no financial-route power', () => {
    it.each(
      [...ROLE_CATALOG.fund.map((r) => [r, 'fund'] as [string, string]),
       ...ROLE_CATALOG.project.map((r) => [r, 'project'] as [string, string])],
    )('%s@%s denied on expense.decide', async (role, scopeType) => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant(role, scopeType, 1)]);
      const decision = await policy.can(actor(), 'expense.decide');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toBe('denied:no-matching-grant');
    });
  });

  describe('scope chain: project → owning organization', () => {
    it('an org grant authorizes resources of projects the org owns', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant('org_accountant', 'organization', 5)]);
      mockPrisma.project.findUnique.mockResolvedValue({ ownerOrganizationId: 5 });

      const decision = await policy.can(actor(), 'expense.decide', { projectId: 33 });
      expect(decision.allow).toBe(true);
      expect(decision.reason).toBe('granted:org_accountant@organization:5');
    });

    it('a grant scoped to a different organization is refused', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant('org_accountant', 'organization', 6)]);
      mockPrisma.project.findUnique.mockResolvedValue({ ownerOrganizationId: 5 });

      const decision = await policy.can(actor(), 'expense.decide', { projectId: 33 });
      expect(decision.allow).toBe(false);
    });

    it('platform grants apply everywhere in the chain', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant('board_chair', 'platform')]);
      const decision = await policy.can(actor(), 'organization.manage', { organizationId: 9 });
      expect(decision.allow).toBe(true);
    });
  });

  describe('legacy @Roles translation (shadow bridge)', () => {
    it('["administrator","employee"] admits a staff grant holder', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant('staff', 'organization', 1)]);
      const decision = await policy.can(actor(), 'route:POST /x', {}, ['administrator', 'employee']);
      expect(decision.allow).toBe(true);
      expect(decision.reason).toBe('granted:staff@organization:1');
    });

    it('["participant"] is an actor-attribute condition, not a grant', async () => {
      const yes = await policy.can(actor('participant'), 'route:POST /donations', {}, ['participant']);
      expect(yes).toMatchObject({ allow: true, reason: 'granted:condition:is_participant' });

      const no = await policy.can(actor('admin'), 'route:POST /donations', {}, ['participant']);
      expect(no).toMatchObject({ allow: false, reason: 'denied:no-matching-grant' });
    });

    it('an empty legacy list means any authenticated actor', async () => {
      const decision = await policy.can(actor('participant'), 'route:GET /auth/me', {}, []);
      expect(decision).toMatchObject({ allow: true, reason: 'granted:authenticated' });
    });
  });

  describe('capability condition handler (W1-E4-S1 AC)', () => {
    beforeEach(() => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([grant('org_admin', 'organization', 5)]);
      mockPrisma.project.findUnique.mockResolvedValue({ ownerOrganizationId: 5 });
    });

    it('project.donation.open allows when the owning org has canOpenDonations', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        capabilities: { canOpenDonations: true },
      });
      const decision = await policy.can(actor(), 'project.donation.open', { projectId: 33 });
      expect(decision.allow).toBe(true);
    });

    it('…and denies with the condition as the reason when the capability is off', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        capabilities: { canOpenDonations: false },
      });
      const decision = await policy.can(actor(), 'project.donation.open', { projectId: 33 });
      expect(decision).toMatchObject({
        allow: false,
        reason: 'denied:condition:org_has_capability:canOpenDonations',
      });
    });
  });

  it('flags sensitive action classes for decision auditing (W1-E4-S4)', () => {
    for (const action of ['donation.decide', 'expense.decide', 'budget.write', 'transaction.write', 'organization.capability.set']) {
      expect(policy.isSensitive(action)).toBe(true);
    }
    expect(policy.isSensitive('project.donation.open')).toBe(false);
    expect(policy.isSensitive('route:GET /x')).toBe(false);
  });
});
