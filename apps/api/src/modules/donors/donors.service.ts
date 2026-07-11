import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDonorDto, UpdateDonorDto } from './dto/donor.dto';

@Injectable()
export class DonorsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  private async assertParticipantExists(participantId?: number) {
    if (participantId == null) return;
    const participant = await this.prisma.participant.findFirst({ where: { id: participantId, deletedAt: null } });
    if (!participant) throw new NotFoundException(`Participant #${participantId} not found`);
  }

  async create(actor: ActorContext, dto: CreateDonorDto) {
    await this.assertParticipantExists(dto.participantId);
    const donor = await this.prisma.donor.create({
      data: { ...dto, createdByUserId: actor.userId },
    });
    this.eventBus.publish({
      event: 'donor.created',
      actor,
      subject: { type: 'donor', id: donor.id },
      data: { name: donor.name, type: donor.type },
    });
    return donor;
  }

  async list() {
    return this.prisma.donor.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
      include: { _count: { select: { funds: true, donations: true } } },
    });
  }

  async detail(id: number) {
    const donor = await this.prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: { funds: { select: { id: true, name: true, status: true } } },
    });
    if (!donor) throw new NotFoundException(`Donor #${id} not found`);
    return donor;
  }

  async update(actor: ActorContext, id: number, dto: UpdateDonorDto) {
    const donor = await this.prisma.donor.findFirst({ where: { id, deletedAt: null } });
    if (!donor) throw new NotFoundException(`Donor #${id} not found`);
    await this.assertParticipantExists(dto.participantId);
    const updated = await this.prisma.donor.update({ where: { id }, data: dto });
    this.eventBus.publish({
      event: 'donor.updated',
      actor,
      subject: { type: 'donor', id },
      data: { changedFields: Object.keys(dto) },
    });
    return updated;
  }

  /**
   * Donations made, projects funded, spending details — traced through the
   * chain the donor's money actually followed: Donor → FundDonation → Fund →
   * FundAllocation → Project, and Fund → Expense for how it was spent.
   */
  async report(id: number) {
    const donor = await this.detail(id);

    const donations = await this.prisma.fundDonation.findMany({
      where: { donorId: id },
      orderBy: { donatedAt: 'desc' },
      include: { fund: { select: { id: true, name: true, type: true } } },
    });
    const totalDonated = donations
      .filter((d) => d.status === 'approved')
      .reduce((sum, d) => sum + Number(d.amount), 0);

    // W9-stabilization — Funding Platform Audit §5: this Donor row is a
    // staff-managed identity; `donations` above only ever sees FundDonation
    // rows filed straight against this Donor (a cash/check gift, say). If the
    // same person also has a logged-in Participant identity (donor.participantId,
    // see the schema comment), the SAME person's online/QR/project-cash gifts
    // and any fund donations they made themselves live in different tables
    // under participantId, not donorId — the total below previously missed
    // them entirely. Zero cost when unlinked (the common case today).
    const participantId = donor.participantId;
    const otherChannels = participantId == null
      ? { fundDonationsByParticipant: 0, onlineDonations: 0, projectDonations: 0 }
      : await (async () => {
          const [byParticipant, online, cash] = await Promise.all([
            this.prisma.fundDonation.aggregate({
              where: { participantId, donorId: null, status: 'approved' },
              _sum: { amount: true },
            }),
            this.prisma.onlineDonation.aggregate({
              where: { participantId, status: 'completed' },
              _sum: { amount: true },
            }),
            this.prisma.projectDonation.aggregate({
              where: { participantId, status: 'approved' },
              _sum: { amount: true },
            }),
          ]);
          return {
            fundDonationsByParticipant: Number(byParticipant._sum.amount ?? 0),
            onlineDonations: Number(online._sum.amount ?? 0),
            projectDonations: Number(cash._sum.amount ?? 0),
          };
        })();
    const totalDonatedAllChannels =
      totalDonated + otherChannels.fundDonationsByParticipant + otherChannels.onlineDonations + otherChannels.projectDonations;

    const fundIds = [...new Set(donations.map((d) => d.fundId))];

    // W9 — Step 7: "Donor → funded sectors, funded organizations, funded
    // projects." Sectors come from the donated-to funds' own category (an
    // org fund's category *is* its sector; a donor fund donated to directly
    // may have none). Organizations come from those funds' managing org,
    // plus the owning org of every project the money actually reached.
    const fundedFunds = fundIds.length
      ? await this.prisma.fund.findMany({
          where: { id: { in: fundIds } },
          include: {
            categoryNode: { select: { id: true, key: true, name: true } },
            managingOrganization: { select: { id: true, name: true } },
          },
        })
      : [];
    const fundedSectors = [
      ...new Map(
        fundedFunds.filter((f) => f.categoryNode != null).map((f) => [f.categoryNode!.id, f.categoryNode!]),
      ).values(),
    ];

    const allocations = fundIds.length
      ? await this.prisma.fundAllocation.findMany({
          where: { fundId: { in: fundIds }, status: { notIn: ['rejected', 'proposed'] } },
          include: {
            fund: { select: { id: true, name: true } },
            project: { select: { id: true, blockId: true, value: true } },
          },
        })
      : [];
    const fundedProjectIds = [...new Set(allocations.map((a) => a.projectId))];

    const projectOwners = fundedProjectIds.length
      ? await this.prisma.project.findMany({
          where: { id: { in: fundedProjectIds } },
          select: { ownerOrganization: { select: { id: true, name: true } } },
        })
      : [];
    const fundedOrganizations = [
      ...new Map(
        [
          ...fundedFunds.filter((f) => f.managingOrganization != null).map((f) => f.managingOrganization!),
          ...projectOwners.map((p) => p.ownerOrganization),
        ].map((o) => [o.id, o]),
      ).values(),
    ];

    const expenses = fundIds.length
      ? await this.prisma.expense.findMany({
          where: { fundId: { in: fundIds }, status: 'approved' },
          include: {
            recipient: { select: { id: true, name: true, type: true } },
            project: { select: { id: true, blockId: true } },
          },
          orderBy: { approvedAt: 'desc' },
        })
      : [];
    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      donor: { id: donor.id, name: donor.name, type: donor.type, participantId: donor.participantId },
      totalDonated,
      totalDonatedAllChannels,
      otherChannels,
      donations,
      fundedProjectIds,
      fundedSectors,
      fundedOrganizations,
      allocations: allocations.map((a) => ({
        fundId: a.fundId,
        fundName: a.fund.name,
        projectId: a.projectId,
        amount: Number(a.amount),
        status: a.status,
      })),
      totalSpent,
      spending: expenses.map((e) => ({
        expenseId: e.id,
        projectId: e.projectId,
        fundId: e.fundId,
        amount: Number(e.amount),
        category: e.category,
        recipient: e.recipient,
        approvedAt: e.approvedAt,
      })),
    };
  }
}
