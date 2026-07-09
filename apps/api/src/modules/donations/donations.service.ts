import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { EmailService } from '../email/email.service';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDonationDto, UpdateDonationStatusDto, DonationQueryDto } from './dto/donation.dto';
import { AdminRole, DonationStatus } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';

@Injectable()
export class DonationsService {
  constructor(
    private prisma: PrismaService,
    private qrService: QrService,
    private emailService: EmailService,
    private projectsService: ProjectsService,
    private notificationsService: NotificationsService,
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
  ) {}

  async findAll(query: DonationQueryDto, role?: string, adminId?: number, participantId?: number) {
    const { page = 1, limit = 15, status, projectId, search } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    // Financial officers only see donations for their assigned projects
    if (role === AdminRole.financial_officer && adminId) {
      where.project = { financialOfficerId: adminId };
    }

    // Participants only see their own donations
    if (role === 'participant' && participantId) {
      where.participantId = participantId;
    }

    if (query.participantId && role !== 'participant') {
      where.participantId = query.participantId;
    }

    // W2 isolation: donations are visible through their project's owner org
    const scopedWhere = await this.tenancy.enforcedProjectRelationWhere(where, 'donation.list');

    const [data, total] = await Promise.all([
      this.prisma.projectDonation.findMany({
        where: scopedWhere,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            include: { block: { include: { translations: true } } },
          },
          participant: {
            include: { user: { select: { email: true, avatar: true } } },
          },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.projectDonation.count({ where: scopedWhere }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number) {
    const donation = await this.prisma.projectDonation.findUnique({
      where: { id },
      include: {
        project: {
          include: { block: { include: { translations: true } } },
        },
        participant: {
          include: { user: { select: { email: true, avatar: true } } },
        },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!donation) throw new NotFoundException(`Donation #${id} not found`);
    await this.tenancy.assertProjectVisible(donation.projectId); // W2 isolation
    return donation;
  }

  async findByToken(token: string) {
    const donation = await this.prisma.projectDonation.findUnique({
      where: { qrToken: token },
      include: {
        project: {
          include: { block: { include: { translations: true } } },
        },
        participant: {
          include: { user: { select: { email: true, avatar: true } } },
        },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!donation) throw new NotFoundException('Donation not found for this QR token');
    await this.tenancy.assertProjectVisible(donation.projectId); // W2 isolation
    return donation;
  }

  async create(actor: ActorContext, dto: CreateDonationDto, participantId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);
    if (project.isCompleted) {
      throw new BadRequestException('This project has reached its funding goal and is no longer accepting donations');
    }
    if (!project.isCompleted) {
      const blockActive = await this.prisma.block.findFirst({
        where: { id: project.blockId, isActive: true },
      });
      if (!blockActive) throw new BadRequestException('Project is not active');
    }

    const qrToken = this.qrService.generateToken();

    const donation = await this.prisma.projectDonation.create({
      data: {
        projectId: dto.projectId,
        participantId,
        amount: dto.amount,
        status: DonationStatus.pending,
        qrToken,
      },
      include: {
        project: { include: { block: { include: { translations: true } } } },
        participant: { include: { user: { select: { email: true } } } },
      },
    });

    this.eventBus.publish({
      event: 'donation.pledged',
      actor,
      subject: { type: 'donation', id: donation.id },
      data: { projectId: dto.projectId, amount: dto.amount },
    });

    // Generate QR data URL to embed in response
    const qrDataUrl = await this.qrService.generateQrDataUrl(qrToken);

    return { ...donation, qrDataUrl };
  }

  async updateStatus(
    actor: ActorContext,
    id: number,
    dto: UpdateDonationStatusDto,
    adminId: number,
    adminRole: string,
  ) {
    const donation = await this.findById(id);

    if (donation.status === DonationStatus.approved) {
      throw new BadRequestException('Approved donations cannot be modified');
    }
    if (donation.status === DonationStatus.cancelled) {
      throw new BadRequestException('Cancelled donations cannot be modified');
    }

    // Financial officers can only update donations for their projects
    if (adminRole === AdminRole.financial_officer) {
      const project = await this.prisma.project.findUnique({ where: { id: donation.projectId } });
      if (project?.financialOfficerId !== adminId) {
        throw new ForbiddenException('You are not assigned to this project');
      }
    }

    const updateData: any = {
      status: dto.status,
      notes: dto.notes,
    };

    if (dto.status === DonationStatus.approved) {
      updateData.approvedBy = adminId;
      updateData.approvedByUserId = actor.userId; // W2-E2-S2 dual-write (D2)
      updateData.approvedAt = new Date();
    }

    const updated = await this.prisma.projectDonation.update({
      where: { id },
      data: updateData,
      include: {
        project: { include: { block: { include: { translations: true } } } },
        participant: { include: { user: { select: { email: true } } } },
      },
    });

    if (dto.status === DonationStatus.approved || dto.status === DonationStatus.rejected) {
      this.eventBus.publish({
        event: dto.status === DonationStatus.approved ? 'donation.approved' : 'donation.rejected',
        actor,
        subject: { type: 'donation', id },
        data: { projectId: donation.projectId, amount: Number(donation.amount) },
      });
    }

    // Update project progress after approval/rejection
    if (dto.status === DonationStatus.approved || dto.status === DonationStatus.rejected) {
      await this.projectsService.recalculateProgress(donation.projectId);
    }

    // Create income transaction in ledger when donation is approved
    if (dto.status === DonationStatus.approved) {
      const project = await this.prisma.project.findUnique({ where: { id: donation.projectId } });
      if (project) {
        this.prisma.projectTransaction.create({
          data: {
            projectId: project.blockId,
            projectRefId: donation.projectId, // W2-E1-S2 dual-write (D1)
            type: 'income',
            amount: donation.amount,
            referenceType: 'donation',
            referenceId: donation.id,
          },
        }).catch(() => null);
      }
    }

    // Fire in-app notification + queue email for cash donation approval
    if (dto.status === DonationStatus.approved) {
      this.notificationsService
        .notify({ type: 'donation_cash_approved', donationId: updated.id })
        .catch(() => null);
    }

    // Send email notifications
    const participantEmail = updated.participant.user?.email;
    const participantName = `${updated.participant.firstName} ${updated.participant.lastName}`;
    const projectName = updated.project.block.translations[0]?.name || 'Project';

    if (participantEmail) {
      if (dto.status === DonationStatus.approved) {
        await this.emailService.sendDonationApprovedEmail(
          participantEmail,
          participantName,
          projectName,
          Number(updated.amount),
          updated.id,
        );
      } else if (dto.status === DonationStatus.rejected) {
        await this.emailService.sendDonationRejectedEmail(
          participantEmail,
          participantName,
          projectName,
          dto.notes,
        );
      }
    }

    return updated;
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async cancelDonation(id: number, participantId: number) {
    const donation = await this.findById(id);

    if (donation.participantId !== participantId) {
      throw new ForbiddenException('You can only cancel your own donations');
    }
    if (donation.status !== DonationStatus.pending) {
      throw new BadRequestException('Only pending donations can be cancelled');
    }

    return this.prisma.projectDonation.update({
      where: { id },
      data: { status: DonationStatus.cancelled },
    });
  }

  async getQrCode(token: string, format: 'dataurl' | 'buffer' = 'dataurl') {
    const donation = await this.prisma.projectDonation.findUnique({ where: { qrToken: token } });
    if (!donation) throw new NotFoundException('Donation not found');
    await this.tenancy.assertProjectVisible(donation.projectId); // W2 isolation

    if (format === 'buffer') {
      return this.qrService.generateQrBuffer(token);
    }
    return { qrDataUrl: await this.qrService.generateQrDataUrl(token) };
  }
}
