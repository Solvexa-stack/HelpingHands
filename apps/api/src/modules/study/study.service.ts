import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole, FileType, ProjectType, SectionStatus, StudyStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChangeStudyStatusDto } from './dto/change-study-status.dto';
import { CreateStudyDto } from './dto/create-study.dto';
import { StudyFiltersDto } from './dto/study-filters.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

// Valid status transitions for the study state machine
const VALID_TRANSITIONS: Partial<Record<StudyStatus, StudyStatus[]>> = {
  [StudyStatus.draft]: [StudyStatus.in_review],
  [StudyStatus.in_review]: [StudyStatus.published, StudyStatus.draft],
  [StudyStatus.published]: [StudyStatus.voting_open],
  [StudyStatus.voting_open]: [StudyStatus.voting_closed, StudyStatus.voting_open],
  [StudyStatus.voting_closed]: [StudyStatus.approved, StudyStatus.rejected, StudyStatus.in_review],
};

// Transitions that require administrator role
const ADMIN_ONLY_TARGETS = new Set<StudyStatus>([
  StudyStatus.published,
  StudyStatus.voting_open,
  StudyStatus.voting_closed,
  StudyStatus.approved,
  StudyStatus.rejected,
]);

// Map ProjectCategory values that overlap with ProjectType
const CATEGORY_TO_TYPE: Record<string, ProjectType> = {
  agricultural: ProjectType.agricultural,
  industrial: ProjectType.industrial,
  trading: ProjectType.trading,
};

@Injectable()
export class StudyService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async createStudy(dto: CreateStudyDto, createdById: number) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);

    const existing = await this.prisma.projectStudy.findUnique({
      where: { projectId: dto.projectId },
    });
    if (existing) throw new BadRequestException('This project already has a study');

    const projectType = CATEGORY_TO_TYPE[project.category] ?? ProjectType.trading;
    const templates = await this.prisma.studyDepartmentTemplate.findMany({
      where: { projectType, isActive: true },
      orderBy: { order: 'asc' },
    });

    const study = await this.prisma.projectStudy.create({
      data: {
        projectId: dto.projectId,
        status: StudyStatus.draft,
        summary: dto.summary,
        votingStartsAt: dto.votingStartsAt ? new Date(dto.votingStartsAt) : undefined,
        votingEndsAt: dto.votingEndsAt ? new Date(dto.votingEndsAt) : undefined,
        createdById,
        sections: {
          create: templates.map((t) => ({
            name: t.name,
            description: t.description,
            order: t.order,
            isRequired: t.isRequired,
            status: SectionStatus.pending,
          })),
        },
      },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: { files: true, assignedAdmin: { select: { id: true, firstName: true, lastName: true } } },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.prisma.project.update({
      where: { id: dto.projectId },
      data: { studyStatus: StudyStatus.draft },
    });

    return { ...study, votesSummary: { for: 0, against: 0, abstain: 0, total: 0 } };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────────

  async getStudy(studyId: number) {
    const study = await this.prisma.projectStudy.findUnique({
      where: { id: studyId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            files: true,
            assignedAdmin: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    return { ...study, votesSummary: await this.buildVotesSummary(study.id) };
  }

  async getStudyByProject(projectId: number) {
    const study = await this.prisma.projectStudy.findFirst({
      where: {
        projectId,
        status: {
          in: [
            StudyStatus.published,
            StudyStatus.voting_open,
            StudyStatus.voting_closed,
            StudyStatus.approved,
          ],
        },
      },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: { files: true },
        },
      },
    });
    if (!study) throw new NotFoundException('No published study found for this project');

    return { ...study, votesSummary: await this.buildVotesSummary(study.id) };
  }

  async listStudies(filters: StudyFiltersDto, user: JwtPayload) {
    const { status, projectId, page = 1, limit = 15 } = filters;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    if (user.role === AdminRole.financial_officer) {
      const assigned = await this.prisma.project.findMany({
        where: { financialOfficerId: user.referenceId },
        select: { id: true },
      });
      where.projectId = { in: assigned.map((p) => p.id) };
    }

    const [data, total] = await Promise.all([
      this.prisma.projectStudy.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { include: { block: { include: { translations: true } } } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sections: true, votes: true } },
        },
      }),
      this.prisma.projectStudy.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  // ─── Sections ─────────────────────────────────────────────────────────────────

  async updateSection(
    sectionId: number,
    dto: UpdateSectionDto,
    requestingAdminId: number,
    requestingRole: string,
  ) {
    const section = await this.prisma.studySection.findUnique({
      where: { id: sectionId },
      include: { study: true },
    });
    if (!section) throw new NotFoundException(`Section #${sectionId} not found`);

    if (
      requestingRole !== AdminRole.administrator &&
      section.assignedTo !== requestingAdminId
    ) {
      throw new ForbiddenException('You are not assigned to this section');
    }

    const updated = await this.prisma.studySection.update({
      where: { id: sectionId },
      data: {
        content: dto.content,
        status: dto.status,
        assignedTo: dto.assignedTo,
        completedAt:
          dto.status === SectionStatus.completed
            ? new Date()
            : dto.status !== undefined
              ? null
              : undefined,
      },
    });

    // Auto-transition study to in_review when all required sections are completed
    if (
      dto.status === SectionStatus.completed &&
      section.study.status === StudyStatus.draft
    ) {
      const pendingRequired = await this.prisma.studySection.count({
        where: {
          studyId: section.studyId,
          isRequired: true,
          status: { not: SectionStatus.completed },
        },
      });

      if (pendingRequired === 0) {
        await this.prisma.projectStudy.update({
          where: { id: section.studyId },
          data: { status: StudyStatus.in_review },
        });
        await this.prisma.project.update({
          where: { id: section.study.projectId },
          data: { studyStatus: StudyStatus.in_review },
        });
      }
    }

    return updated;
  }

  // ─── Files ────────────────────────────────────────────────────────────────────

  async uploadSectionFiles(sectionId: number, files: Express.Multer.File[]) {
    const section = await this.prisma.studySection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException(`Section #${sectionId} not found`);

    const appUrl = this.config.get<string>('app.url', 'http://localhost:4000');

    return Promise.all(
      files.map((file) =>
        this.prisma.studySectionFile.create({
          data: {
            sectionId,
            name: file.originalname,
            url: `${appUrl}/uploads/${file.filename}`,
            fileType: this.resolveFileType(file.mimetype),
          },
        }),
      ),
    );
  }

  async deleteSectionFile(fileId: number) {
    const file = await this.prisma.studySectionFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException(`File #${fileId} not found`);

    try {
      const uploadDir = this.config.get<string>('app.uploadDir', './uploads');
      const filename = file.url.split('/uploads/').pop();
      if (filename) {
        const filePath = path.join(process.cwd(), uploadDir.replace('./', ''), filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch {
      // Non-critical — file may already be gone
    }

    await this.prisma.studySectionFile.delete({ where: { id: fileId } });
  }

  // ─── Status machine ───────────────────────────────────────────────────────────

  async changeStatus(
    studyId: number,
    dto: ChangeStudyStatusDto,
    adminId: number,
    adminRole: string,
  ) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    const allowed = VALID_TRANSITIONS[study.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${study.status}" to "${dto.status}"`,
      );
    }

    if (ADMIN_ONLY_TARGETS.has(dto.status) && adminRole !== AdminRole.administrator) {
      throw new ForbiddenException('Only administrators can perform this status change');
    }

    if (dto.status === StudyStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const updateData: any = { status: dto.status };

    if (dto.status === StudyStatus.published) updateData.publishedAt = new Date();
    if (dto.status === StudyStatus.voting_open) {
      // Allow re-applying voting_open to extend the deadline — only update start if not already set
      if (!study.votingStartsAt) {
        updateData.votingStartsAt = dto.votingStartsAt ? new Date(dto.votingStartsAt) : new Date();
      }
      if (dto.votingEndsAt) updateData.votingEndsAt = new Date(dto.votingEndsAt);
    }
    if (dto.status === StudyStatus.voting_closed) updateData.votingEndsAt = new Date();
    if (dto.status === StudyStatus.approved) {
      updateData.approvedById = adminId;
      updateData.approvedAt = new Date();
    }
    if (dto.rejectionReason) updateData.rejectionReason = dto.rejectionReason;

    // Keep Project.studyStatus mirrored; use transaction for approved
    const [updatedStudy] = await this.prisma.$transaction([
      this.prisma.projectStudy.update({ where: { id: studyId }, data: updateData }),
      this.prisma.project.update({
        where: { id: study.projectId },
        data: { studyStatus: dto.status },
      }),
    ]);

    // Fire async notifications — non-blocking
    this.fireStatusNotification(dto.status, studyId, study.projectId, adminId, dto.rejectionReason);

    return updatedStudy;
  }

  private fireStatusNotification(
    status: StudyStatus,
    studyId: number,
    projectId: number,
    adminId: number,
    reason?: string,
  ) {
    switch (status) {
      case StudyStatus.published:
        this.notificationsService.notify({ type: 'study_published', studyId, projectId }).catch(() => null);
        break;
      case StudyStatus.voting_open:
        this.notificationsService.notify({ type: 'voting_open', studyId, projectId }).catch(() => null);
        break;
      case StudyStatus.approved:
        this.notificationsService.notify({ type: 'study_approved', studyId, projectId }).catch(() => null);
        break;
      case StudyStatus.rejected:
        this.notificationsService
          .notify({ type: 'study_rejected', studyId, adminId, reason: reason ?? '' })
          .catch(() => null);
        break;
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async deleteStudy(studyId: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);
    if (study.status !== StudyStatus.draft) {
      throw new BadRequestException('Only draft studies can be deleted');
    }

    await this.prisma.$transaction([
      this.prisma.projectStudy.delete({ where: { id: studyId } }),
      this.prisma.project.update({
        where: { id: study.projectId },
        data: { studyStatus: null },
      }),
    ]);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async buildVotesSummary(studyId: number) {
    const groups = await this.prisma.studyVote.groupBy({
      by: ['choice'],
      where: { studyId },
      _count: { choice: true },
    });

    const summary = { for: 0, against: 0, abstain: 0, total: 0 };
    for (const g of groups) {
      summary[g.choice] = g._count.choice;
      summary.total += g._count.choice;
    }
    return summary;
  }

  private resolveFileType(mimetype: string): FileType {
    if (mimetype.startsWith('image/')) return FileType.image;
    if (mimetype.startsWith('video/')) return FileType.video;
    return FileType.pdf;
  }
}
