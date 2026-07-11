import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonationStatus, FundStatus, FundType, Prisma } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TreasuryService } from '../treasury/treasury.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ReportingObligationsService } from '../org-reporting/reporting-obligations.service';
import { CreateFundDonationDto, CreateFundDto, ProposeAllocationDto, UpdateFundDto } from './dto/fund.dto';

export const FUND_ROLES = ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'];

/**
 * W5-E3/E6 — funds: Board-gated CRUD, fund-scope officers (five roles,
 * segregation of duties via the policy engine), and the allocation lifecycle
 * on the `fund-allocation` workflow definition (activated this wave).
 *
 * Launch ceiling (E6-S2): every fund starts with dualApprovalThreshold=0 in
 * its policy — every allocation approval requires a BoardDecision until the
 * Board relaxes the threshold (audited policy change).
 */
@Injectable()
export class FundsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private treasury: TreasuryService,
    private workflow: WorkflowService,
    private reportingObligations: ReportingObligationsService,
  ) {}

  // ─── Fund CRUD (Board) ───────────────────────────────────────────────────────

  async create(actor: ActorContext, dto: CreateFundDto) {
    await this.assertOwnerConsistent(dto.type, dto.managingOrganizationId, dto.donorId);
    const fund = await this.prisma.fund.create({
      data: {
        name: dto.name,
        purpose: dto.purpose,
        type: dto.type ?? FundType.organization,
        managingOrganizationId: dto.managingOrganizationId,
        donorId: dto.donorId,
        // launch ceiling: Board decision on every allocation until relaxed
        policy: ({ dualApprovalThreshold: 0, ...(dto.policy ?? {}) }) as Prisma.InputJsonValue,
      },
    });
    await this.treasury.fundAccount(fund.id, fund.name);
    this.eventBus.publish({
      event: 'fund.created',
      actor,
      subject: { type: 'fund', id: fund.id },
      data: { name: fund.name, type: fund.type },
    });
    return fund;
  }

  async list() {
    const funds = await this.prisma.fund.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: { _count: { select: { memberships: true, allocations: true, fundDonations: true, expenses: true } } },
    });
    return Promise.all(
      funds.map(async (fund) => ({
        ...fund,
        balance: await this.fundBalance(fund.id),
      })),
    );
  }

  async detail(fundId: number) {
    const fund = await this.prisma.fund.findFirst({
      where: { id: fundId, deletedAt: null },
      include: {
        managingOrganization: { select: { id: true, name: true, type: true } },
        donor: { select: { id: true, name: true, type: true } },
        memberships: { include: { user: { select: { id: true, email: true } } } },
        allocations: { orderBy: { id: 'desc' }, include: { project: { select: { id: true, blockId: true } } } },
      },
    });
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);

    const grants = await this.prisma.roleAssignment.findMany({
      where: { scopeType: 'fund', scopeId: fundId },
    });
    const account = await this.treasury.fundAccount(fundId, fund.name);
    const balance = await this.treasury.balance(account.id);
    const allocations = await Promise.all(
      fund.allocations.map(async (a) => ({ ...a, disbursed: await this.disbursedAmount(a.id) })),
    );

    return {
      ...fund,
      accountId: account.id,
      balance,
      allocations,
      memberships: fund.memberships.map((m) => ({
        ...m,
        roles: grants.filter((g) => g.userId === m.userId).map((g) => g.role),
      })),
    };
  }

  async update(actor: ActorContext, fundId: number, dto: UpdateFundDto) {
    const fund = await this.prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    const nextType = dto.type ?? fund.type;
    const nextOrgId = dto.managingOrganizationId !== undefined ? dto.managingOrganizationId : fund.managingOrganizationId;
    const nextDonorId = dto.donorId !== undefined ? dto.donorId : fund.donorId;
    await this.assertOwnerConsistent(nextType, nextOrgId ?? undefined, nextDonorId ?? undefined);

    const updated = await this.prisma.fund.update({
      where: { id: fundId },
      data: {
        name: dto.name,
        purpose: dto.purpose,
        status: dto.status,
        type: dto.type,
        managingOrganizationId: dto.managingOrganizationId,
        donorId: dto.donorId,
        ...(dto.policy ? { policy: dto.policy as Prisma.InputJsonValue } : {}),
      },
    });
    // policy/status/type changes are Board-audited (threshold relaxation path)
    this.eventBus.publish({
      event: 'fund.updated',
      actor,
      subject: { type: 'fund', id: fundId },
      data: {
        changedFields: Object.keys(dto),
        before: { status: fund.status, type: fund.type, policy: fund.policy },
        after: { status: updated.status, type: updated.type, policy: updated.policy },
      },
    });
    return updated;
  }

  /**
   * W8 — light, non-blocking guidance rather than a hard DB constraint: the
   * requirement is explicit that "a fund may optionally belong to an
   * organization," so type/owner pairing is a nudge (donorId only makes
   * sense alongside type=donor, and vice versa), not an enforced invariant.
   */
  private async assertOwnerConsistent(type: FundType | undefined, managingOrganizationId?: number, donorId?: number) {
    if (donorId != null) {
      const donor = await this.prisma.donor.findFirst({ where: { id: donorId, deletedAt: null } });
      if (!donor) throw new NotFoundException(`Donor #${donorId} not found`);
    }
    if (managingOrganizationId != null) {
      const org = await this.prisma.organization.findUnique({ where: { id: managingOrganizationId } });
      if (!org) throw new NotFoundException(`Organization #${managingOrganizationId} not found`);
    }
    if (type === FundType.donor && donorId == null) {
      throw new BadRequestException('A donor-type fund should reference a donorId');
    }
  }

  // ─── Officers (fund-scope grants) ────────────────────────────────────────────

  async addOfficer(actor: ActorContext, fundId: number, userId: number, role: string) {
    if (!FUND_ROLES.includes(role)) throw new BadRequestException(`Unknown fund role "${role}"`);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('userId must be a positive integer');
    const [fund, user] = await Promise.all([
      this.prisma.fund.findUnique({ where: { id: fundId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    await this.prisma.fundMembership.upsert({
      where: { fundId_userId: { fundId, userId } },
      create: { fundId, userId },
      update: {},
    });
    const existing = await this.prisma.roleAssignment.findFirst({
      where: { userId, role, scopeType: 'fund', scopeId: fundId },
    });
    if (existing) throw new ConflictException('Role already granted');
    const grant = await this.prisma.roleAssignment.create({
      data: { userId, role, scopeType: 'fund', scopeId: fundId, grantedBy: actor.userId },
    });
    this.eventBus.publish({
      event: 'role.granted',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId, role, scopeType: 'fund', scopeId: fundId },
    });
    return grant;
  }

  async removeOfficer(actor: ActorContext, fundId: number, userId: number, role: string) {
    const grant = await this.prisma.roleAssignment.findFirst({
      where: { userId, role, scopeType: 'fund', scopeId: fundId },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    await this.prisma.roleAssignment.delete({ where: { id: grant.id } });
    this.eventBus.publish({
      event: 'role.revoked',
      actor,
      subject: { type: 'role_assignment', id: grant.id },
      data: { userId, role, scopeType: 'fund', scopeId: fundId },
    });
  }

  // ─── Allocations (fund → project, on the workflow engine) ────────────────────

  async proposeAllocation(actor: ActorContext, fundId: number, dto: ProposeAllocationDto) {
    const fund = await this.prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    if (fund.status !== 'active') {
      throw new BadRequestException(`Fund is ${fund.status} — no new allocations`);
    }
    if (!Number.isInteger(dto.projectId) || dto.projectId <= 0) {
      throw new BadRequestException('projectId must be a positive integer');
    }
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new BadRequestException('Allocation amount must be positive');

    // The project must belong to (own or execute) the fund's own managing
    // organization — funds with no managing org place no such restriction.
    if (fund.managingOrganizationId != null) {
      const fundOwnsOrExecutes = await this.orgOwnsOrExecutesProject(fund.managingOrganizationId, dto.projectId, project);
      if (!fundOwnsOrExecutes) {
        throw new BadRequestException("Project does not belong to this fund's managing organization");
      }
    }

    // W6-E1-S2: allocations under an agreement must match its fund, be active,
    // and finance a project the agreement org owns or executes.
    if (dto.fundingAgreementId != null) {
      const agreement = await this.prisma.fundingAgreement.findFirst({
        where: { id: dto.fundingAgreementId, deletedAt: null },
      });
      if (!agreement) throw new NotFoundException(`Agreement #${dto.fundingAgreementId} not found`);
      if (agreement.fundId !== fundId) {
        throw new BadRequestException('Agreement belongs to a different fund');
      }
      if (agreement.status !== 'active') {
        throw new BadRequestException(`Agreement is ${agreement.status} — no new allocations under it`);
      }
      const orgExecutes = await this.orgOwnsOrExecutesProject(agreement.organizationId, dto.projectId, project);
      if (!orgExecutes) {
        throw new BadRequestException(
          'The agreement organization neither owns nor executes this project',
        );
      }
    }

    const allocation = await this.prisma.fundAllocation.create({
      data: {
        fundId,
        projectId: dto.projectId,
        amount: new Prisma.Decimal(dto.amount),
        note: dto.note,
        fundingAgreementId: dto.fundingAgreementId,
        createdByUserId: actor.userId,
      },
    });
    await this.workflow.start(actor, { subjectType: 'fund_allocation', subjectId: allocation.id }, 'fund-allocation');
    this.eventBus.publish({
      event: 'allocation.proposed',
      actor,
      subject: { type: 'fund_allocation', id: allocation.id },
      data: { fundId, projectId: dto.projectId, amount: dto.amount, fundingAgreementId: dto.fundingAgreementId ?? null },
    });
    return allocation;
  }

  /**
   * Approval: the board_decision guard on the `approve` transition requires a
   * BoardDecision(subject=fund_allocation, approved) — with the launch
   * ceiling, that means every allocation (E6-S2).
   */
  async approveAllocation(actor: ActorContext, allocationId: number) {
    const allocation = await this.allocationOr404(allocationId);
    const decision = await this.prisma.boardDecision.findFirst({
      where: { subjectType: 'fund_allocation', subjectId: allocationId, decision: 'approved' },
      orderBy: { decidedAt: 'desc' },
    });
    await this.workflow.execute(actor, { subjectType: 'fund_allocation', subjectId: allocationId }, 'approve', {
      note: decision ? `board decision #${decision.id}` : undefined,
      sync: async (tx) => {
        await tx.fundAllocation.update({
          where: { id: allocationId },
          data: { status: 'board_approved', approvedByDecisionId: decision?.id ?? null },
        });
      },
    });
    return this.allocationOr404(allocationId);
  }

  async rejectAllocation(actor: ActorContext, allocationId: number) {
    await this.allocationOr404(allocationId);
    await this.workflow.execute(actor, { subjectType: 'fund_allocation', subjectId: allocationId }, 'reject', {
      sync: async (tx) => {
        await tx.fundAllocation.update({ where: { id: allocationId }, data: { status: 'rejected' } });
      },
    });
    return this.allocationOr404(allocationId);
  }

  /** Disbursement tranche: fund account → project account (LedgerTransaction). */
  async disburse(actor: ActorContext, allocationId: number, amount: number) {
    const allocation = await this.allocationOr404(allocationId);
    const fund = await this.prisma.fund.findUnique({ where: { id: allocation.fundId } });
    if (fund!.status !== 'active') {
      throw new BadRequestException(`Fund is ${fund!.status} — disbursements blocked`);
    }
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Tranche amount must be positive');

    // W6-E1-S2: agreement terms can hold money back while reports are overdue
    if (allocation.fundingAgreementId != null) {
      const agreement = await this.prisma.fundingAgreement.findUnique({
        where: { id: allocation.fundingAgreementId },
      });
      if (agreement && agreement.status !== 'active') {
        throw new BadRequestException(`Agreement is ${agreement.status} — disbursements blocked`);
      }
      const blockOnOverdue =
        ((agreement?.terms ?? {}) as { blockDisbursementsOnOverdueReports?: boolean })
          .blockDisbursementsOnOverdueReports !== false; // default: block
      if (agreement && blockOnOverdue) {
        const overdue = (await this.reportingObligations.obligationsFor(agreement)).filter((o) => o.overdue);
        if (overdue.length > 0) {
          throw new BadRequestException(
            `Disbursement blocked: ${overdue.length} overdue report(s) under agreement "${agreement.title}" — submit the outstanding reports first`,
          );
        }
      }
    }

    const disbursed = await this.disbursedAmount(allocationId);
    if (disbursed + amount > Number(allocation.amount)) {
      throw new BadRequestException(
        `Tranche exceeds allocation: ${disbursed} disbursed of ${allocation.amount}, tranche ${amount}`,
      );
    }

    // first tranche moves the workflow into disbursing
    if (allocation.status === 'board_approved') {
      await this.workflow.execute(actor, { subjectType: 'fund_allocation', subjectId: allocationId }, 'begin_disbursement', {
        sync: async (tx) => {
          await tx.fundAllocation.update({ where: { id: allocationId }, data: { status: 'disbursing' } });
        },
      });
    } else if (allocation.status !== 'disbursing') {
      throw new BadRequestException(`Allocation is ${allocation.status} — cannot disburse`);
    }

    const trancheNumber = (await this.trancheCount(allocationId)) + 1;
    const [fundAccount, projectAccount] = await Promise.all([
      this.treasury.fundAccount(allocation.fundId),
      this.treasury.projectAccount(allocation.projectId),
    ]);
    const { transaction } = await this.treasury.post(actor, {
      description: `Allocation #${allocationId} tranche ${trancheNumber}: fund ${allocation.fundId} → project ${allocation.projectId}`,
      referenceType: 'fund_allocation',
      referenceId: allocationId,
      event: `tranche.${trancheNumber}`,
      entries: [
        { accountId: fundAccount.id, direction: 'debit', amount },
        { accountId: projectAccount.id, direction: 'credit', amount },
      ],
    });

    this.eventBus.publish({
      event: 'allocation.disbursed',
      actor,
      subject: { type: 'fund_allocation', id: allocationId },
      data: { tranche: trancheNumber, amount, transactionId: transaction.id },
    });
    return { allocation: await this.allocationOr404(allocationId), tranche: trancheNumber, transactionId: transaction.id };
  }

  async reconcileAllocation(actor: ActorContext, allocationId: number) {
    const allocation = await this.allocationOr404(allocationId);
    const disbursed = await this.disbursedAmount(allocationId);
    if (disbursed !== Number(allocation.amount)) {
      throw new BadRequestException(
        `Cannot reconcile: ${disbursed} disbursed of ${allocation.amount}`,
      );
    }
    await this.workflow.execute(actor, { subjectType: 'fund_allocation', subjectId: allocationId }, 'reconcile', {
      sync: async (tx) => {
        await tx.fundAllocation.update({ where: { id: allocationId }, data: { status: 'reconciled' } });
      },
    });
    return this.allocationOr404(allocationId);
  }

  async closeAllocation(actor: ActorContext, allocationId: number) {
    await this.allocationOr404(allocationId);
    await this.workflow.execute(actor, { subjectType: 'fund_allocation', subjectId: allocationId }, 'close', {
      sync: async (tx) => {
        await tx.fundAllocation.update({ where: { id: allocationId }, data: { status: 'closed' } });
      },
    });
    return this.allocationOr404(allocationId);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  async dashboard(fundId: number) {
    const fund = await this.detail(fundId);
    const account = await this.treasury.fundAccount(fundId, fund.name);
    const statement = await this.treasury.statement(account.id);
    const intake = statement.entries
      .filter((e) => e.direction === 'credit')
      .reduce((s, e) => s + e.amount, 0);
    const allocated = fund.allocations
      .filter((a) => !['rejected', 'proposed'].includes(a.status))
      .reduce((s, a) => s + Number(a.amount), 0);
    const disbursed = fund.allocations.reduce((s, a) => s + a.disbursed, 0);
    const spendByProject = fund.allocations
      .filter((a) => a.disbursed > 0)
      .map((a) => ({ projectId: a.projectId, disbursed: a.disbursed, allocated: Number(a.amount), status: a.status }));

    // W8 — fund report additions: total donations received directly by this
    // fund (manual + online, approved/completed only), and total spent via
    // Expense (approved only). `intake` above already reflects both in the
    // ledger balance; these are named breakdowns for the report UI.
    const [fundDonationsSum, onlineDonationsSum, expensesSum] = await Promise.all([
      this.prisma.fundDonation.aggregate({ where: { fundId, status: 'approved' }, _sum: { amount: true } }),
      this.prisma.onlineDonation.aggregate({ where: { fundId, status: 'completed' }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { fundId, status: 'approved' }, _sum: { amount: true } }),
    ]);
    const totalDonations =
      Number(fundDonationsSum._sum.amount ?? 0) + Number(onlineDonationsSum._sum.amount ?? 0);
    const totalSpent = Number(expensesSum._sum.amount ?? 0);

    // W9 — projects this fund is the default fund for (Step 7: "Organization
    // Fund → active projects"). Separate from `spendByProject` above, which
    // is allocation-derived and includes projects funded by co-financing
    // from OTHER funds too.
    const defaultFundProjects = await this.prisma.project.findMany({
      where: { primaryFundId: fundId, deletedAt: null },
      select: { id: true, value: true, isCompleted: true, block: { include: { translations: { take: 1 } } } },
    });

    return {
      fund: { id: fund.id, name: fund.name, type: fund.type, status: fund.status, policy: fund.policy },
      balance: fund.balance,
      intake,
      totalDonations,
      allocated,
      disbursed,
      totalSpent,
      remainingBalance: fund.balance,
      activeProjects: defaultFundProjects
        .filter((p) => !p.isCompleted)
        .map((p) => ({ id: p.id, name: p.block.translations[0]?.name ?? `Project #${p.id}`, value: Number(p.value) })),
      spendByProject,
      statement: statement.entries.slice(-20),
    };
  }

  // ─── Fund donations (Donor → FundDonation → Fund → FundAllocation → Project) ─

  async recordDonation(actor: ActorContext, fundId: number, dto: CreateFundDonationDto) {
    const fund = await this.prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    if (fund.status !== 'active') {
      throw new BadRequestException(`Fund is ${fund.status} — no new donations`);
    }
    if (dto.donorId != null) {
      const donor = await this.prisma.donor.findFirst({ where: { id: dto.donorId, deletedAt: null } });
      if (!donor) throw new NotFoundException(`Donor #${dto.donorId} not found`);
    }
    if (dto.participantId != null) {
      const participant = await this.prisma.participant.findUnique({ where: { id: dto.participantId } });
      if (!participant) throw new NotFoundException(`Participant #${dto.participantId} not found`);
    }

    const donation = await this.prisma.fundDonation.create({
      data: {
        fundId,
        donorId: dto.donorId,
        participantId: dto.participantId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'USD',
        paymentMethod: dto.paymentMethod,
        referenceNumber: dto.referenceNumber,
        donatedAt: new Date(dto.donatedAt),
        notes: dto.notes,
        createdByUserId: actor.userId!,
      },
    });
    this.eventBus.publish({
      event: 'fund_donation.recorded',
      actor,
      subject: { type: 'fund_donation', id: donation.id },
      data: { fundId, amount: dto.amount, paymentMethod: dto.paymentMethod },
    });
    return donation;
  }

  async listDonations(fundId: number) {
    return this.prisma.fundDonation.findMany({
      where: { fundId },
      orderBy: { id: 'desc' },
      include: {
        donor: { select: { id: true, name: true, type: true } },
        participant: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /** Confirming a donation is the trigger: Treasury posts the ledger credit and the fund's available balance increases. */
  async confirmDonation(actor: ActorContext, donationId: number) {
    return this.decideDonation(actor, donationId, DonationStatus.approved);
  }

  async rejectDonation(actor: ActorContext, donationId: number) {
    return this.decideDonation(actor, donationId, DonationStatus.rejected);
  }

  private async decideDonation(actor: ActorContext, donationId: number, status: DonationStatus) {
    const donation = await this.prisma.fundDonation.findUnique({ where: { id: donationId } });
    if (!donation) throw new NotFoundException(`Fund donation #${donationId} not found`);
    if (donation.status !== 'pending') {
      throw new BadRequestException(`Donation is ${donation.status} — only pending donations can be decided`);
    }
    const updated = await this.prisma.fundDonation.update({
      where: { id: donationId },
      data: {
        status,
        approvedByUserId: status === DonationStatus.approved ? actor.userId : undefined,
        approvedAt: status === DonationStatus.approved ? new Date() : undefined,
      },
    });
    // W5-style: awaited so Treasury posts the ledger credit (donation.approved
    // path) before this request returns — never bypass the ledger.
    await this.eventBus.publishAndWait({
      event: status === DonationStatus.approved ? 'fund_donation.approved' : 'fund_donation.rejected',
      actor,
      subject: { type: 'fund_donation', id: donationId },
      data: { fundId: donation.fundId, amount: Number(donation.amount) },
    });
    return updated;
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  /** True if `organizationId` owns the project directly or executes it via an active `executing_agency` participation. */
  private async orgOwnsOrExecutesProject(
    organizationId: number,
    projectId: number,
    project: { ownerOrganizationId: number },
  ): Promise<boolean> {
    if (project.ownerOrganizationId === organizationId) return true;
    const participation = await this.prisma.projectParticipation.findFirst({
      where: {
        projectId,
        organizationId,
        role: 'executing_agency',
        status: 'active',
        deletedAt: null,
      },
    });
    return participation !== null;
  }

  private async allocationOr404(id: number) {
    const allocation = await this.prisma.fundAllocation.findUnique({ where: { id } });
    if (!allocation) throw new NotFoundException(`Allocation #${id} not found`);
    return allocation;
  }

  private async disbursedAmount(allocationId: number): Promise<number> {
    const transactions = await this.prisma.ledgerTransaction.findMany({
      where: { referenceType: 'fund_allocation', referenceId: allocationId, status: 'posted' },
      include: { entries: true },
    });
    const total = transactions.reduce(
      (sum, t) =>
        sum + t.entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + Number(e.amount), 0),
      0,
    );
    return Math.round(total * 100) / 100;
  }

  private async trancheCount(allocationId: number): Promise<number> {
    return this.prisma.ledgerTransaction.count({
      where: { referenceType: 'fund_allocation', referenceId: allocationId },
    });
  }

  private async fundBalance(fundId: number): Promise<number> {
    const account = await this.prisma.account.findFirst({ where: { ownerType: 'fund', ownerId: fundId } });
    return account ? this.treasury.balance(account.id) : 0;
  }
}
