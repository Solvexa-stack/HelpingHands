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
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { PolicyService } from '../policy/policy.service';
import { policyEnforced } from '../policy/policy.guard';
import { GovernanceService } from '../governance/governance.service';
import { WorkflowService } from '../workflow/workflow.service';
import { workflowEnforced } from '../workflow/workflow.types';
import { CategoriesService } from '../categories/categories.service';
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

// Governance transitions: Board roles under policy enforcement (W3, closes the
// D5 finding); legacy administrator-enum gate only when POLICY_ENFORCED=false
// (09 rollback rule).
const GOVERNANCE_TARGETS = new Set<StudyStatus>([
  StudyStatus.published,
  StudyStatus.voting_open,
  StudyStatus.voting_closed,
  StudyStatus.approved,
  StudyStatus.rejected,
]);

// Legacy fallback (pre-W6 rows without a category node): map ProjectCategory
// values that overlap with ProjectType
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
    private eventBus: EventBusService,
    private tenancy: TenancyRepository,
    private policy: PolicyService,
    private governance: GovernanceService,
    private workflow: WorkflowService,
    private categories: CategoriesService,
  ) {}

  /** W4-E4-S2: legacy status→engine action map (transcription of VALID_TRANSITIONS). */
  private static readonly ACTION_MAP: Record<string, string> = {
    'draft>in_review': 'submit',
    'in_review>draft': 'revise',
    'in_review>published': 'publish',
    'published>voting_open': 'open_voting',
    'voting_open>voting_open': 'extend_voting',
    'voting_open>voting_closed': 'close_voting',
    'voting_closed>in_review': 'reopen_review',
  };

  // ─── Create ───────────────────────────────────────────────────────────────────

  async createStudy(actor: ActorContext, dto: CreateStudyDto, createdById: number) {
    await this.tenancy.assertProjectVisible(dto.projectId); // W2 isolation
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException(`Project #${dto.projectId} not found`);

    const existing = await this.prisma.projectStudy.findUnique({
      where: { projectId: dto.projectId },
    });
    if (existing) throw new BadRequestException('This project already has a study');

    // W6-E2-S2: templates come from the category node (child nodes inherit
    // the nearest ancestor's set); the legacy enum path only serves rows the
    // backfill never saw.
    let templates;
    if (project.categoryId != null) {
      templates = await this.categories.templatesForCategory(project.categoryId);
    } else {
      const projectType = CATEGORY_TO_TYPE[project.category ?? ''] ?? ProjectType.trading;
      templates = await this.prisma.studyDepartmentTemplate.findMany({
        where: { projectType, isActive: true },
        orderBy: { order: 'asc' },
      });
    }

    const study = await this.prisma.projectStudy.create({
      data: {
        projectId: dto.projectId,
        status: StudyStatus.draft,
        summary: dto.summary,
        votingStartsAt: dto.votingStartsAt ? new Date(dto.votingStartsAt) : undefined,
        votingEndsAt: dto.votingEndsAt ? new Date(dto.votingEndsAt) : undefined,
        createdById,
        createdByUserId: actor.userId, // W2-E2-S2 dual-write (D2)
        sections: {
          create: templates.map((t) => ({
            name: t.name,
            nameAr: t.nameAr,
            nameFr: t.nameFr,
            description: t.description,
            descriptionAr: t.descriptionAr,
            descriptionFr: t.descriptionFr,
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

    this.eventBus.publish({
      event: 'study.created',
      actor,
      subject: { type: 'study', id: study.id },
      data: { projectId: dto.projectId, sections: study.sections.length },
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
    await this.tenancy.assertProjectVisible(study.projectId); // W2 isolation

    return {
      ...study,
      votesSummary: await this.buildVotesSummary(study.id),
      // W3-E4-S3: Board decisions (incl. changes_requested rationale) are
      // visible to the owning org on the study detail
      decisions: await this.governance.decisionsForStudy(study.id),
    };
  }

  async getStudyByProject(projectId: number) {
    await this.tenancy.assertProjectVisible(projectId); // W2 isolation (no-op for public/anon)
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

    // W7-E1-S3 (privacy hard exclusion, 18): for social-support-category
    // projects, this PUBLIC endpoint never serves section content — it may
    // carry personal beneficiary data (martyr families, widows, orphans,
    // IDPs). Redacted at query result level, not in the UI.
    let sections = study.sections;
    if (await this.isSocialSupportProject(projectId)) {
      sections = sections.map((s) => ({ ...s, content: null, files: [] }));
      return {
        ...study,
        sections,
        beneficiaryDataWithheld: true,
        votesSummary: await this.buildVotesSummary(study.id),
      };
    }

    return { ...study, votesSummary: await this.buildVotesSummary(study.id) };
  }

  /** Is the project's category inside the social_support subtree? */
  private async isSocialSupportProject(projectId: number): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { categoryNode: { select: { id: true, key: true, parentId: true } } },
    });
    let node = project?.categoryNode ?? null;
    while (node) {
      if (node.key === 'social_support') return true;
      node = node.parentId
        ? await this.prisma.projectCategoryNode.findUnique({
            where: { id: node.parentId },
            select: { id: true, key: true, parentId: true },
          })
        : null;
    }
    return false;
  }

  async listStudies(filters: StudyFiltersDto, user: JwtPayload) {
    const { status, projectId, page = 1, limit = 15 } = filters;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    if (user.role === AdminRole.financial_officer) {
      // eslint-disable-next-line no-unscoped-org-reads -- legacy (pre-W2-E3): route through TenancyRepository when touched
      const assigned = await this.prisma.project.findMany({
        where: { financialOfficerId: user.referenceId },
        select: { id: true },
      });
      where.projectId = { in: assigned.map((p) => p.id) };
    }

    // W2 isolation: studies are visible through their project's owner org
    const scopedWhere = await this.tenancy.enforcedProjectRelationWhere(where, 'study.list');

    const [data, total] = await Promise.all([
      this.prisma.projectStudy.findMany({
        where: scopedWhere,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { include: { block: { include: { translations: true } } } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sections: true, votes: true } },
        },
      }),
      this.prisma.projectStudy.count({ where: scopedWhere }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  // ─── Sections ─────────────────────────────────────────────────────────────────

  async updateSection(
    actor: ActorContext,
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
    await this.tenancy.assertProjectVisible(section.study.projectId); // W2 isolation

    // W2-E2-S2: assignee check reads the User-FK twin. Besides the assignee,
    // platform administrators and org_admins of the project's owning
    // organization have full section control.
    if (
      requestingRole !== AdminRole.administrator &&
      section.assignedToUserId !== actor.userId &&
      !(await this.isOwningOrgAdmin(actor.userId, section.study.projectId))
    ) {
      throw new ForbiddenException('You are not assigned to this section');
    }

    let assignedToUserId: number | undefined;
    if (dto.assignedTo !== undefined) {
      const assigneeUser = await this.prisma.user.findFirst({
        where: { referenceType: 'admin', referenceId: dto.assignedTo },
      });
      assignedToUserId = assigneeUser?.id;
    }

    const updated = await this.prisma.studySection.update({
      where: { id: sectionId },
      data: {
        content: dto.content,
        status: dto.status,
        assignedTo: dto.assignedTo,
        assignedToUserId, // W2-E2-S2 dual-write (D2)
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
        if (workflowEnforced('study')) {
          await this.workflow.ensurePositionedInstance(
            { subjectType: 'project', subjectId: section.study.projectId },
            StudyStatus.draft,
          );
          await this.workflow.execute(
            actor,
            { subjectType: 'project', subjectId: section.study.projectId },
            'submit',
            {
              note: 'all required sections completed',
              sync: async (tx) => {
                await tx.projectStudy.update({ where: { id: section.studyId }, data: { status: StudyStatus.in_review } });
                await tx.project.update({ where: { id: section.study.projectId }, data: { studyStatus: StudyStatus.in_review } });
              },
            },
          );
        } else {
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
    }

    if (dto.assignedTo !== undefined) {
      this.eventBus.publish({
        event: 'study_section.assigned',
        actor,
        subject: { type: 'study_section', id: sectionId },
        data: { studyId: section.studyId, assignedTo: dto.assignedTo },
      });
    }
    if (dto.status === SectionStatus.completed) {
      this.eventBus.publish({
        event: 'study_section.completed',
        actor,
        subject: { type: 'study_section', id: sectionId },
        data: { studyId: section.studyId },
      });
    }

    return updated;
  }

  /**
   * Does the user hold an org_admin grant for the project's owning
   * organization? Platform-owned projects (no owning org) never match — a
   * null org must not fall through to holdsAnyGrant, which treats a missing
   * scope as "any organization".
   */
  private async isOwningOrgAdmin(userId: number | null | undefined, projectId: number): Promise<boolean> {
    if (userId == null) return false;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerOrganizationId: true },
    });
    if (project?.ownerOrganizationId == null) return false;
    return this.policy.holdsAnyGrant(
      userId,
      [{ scope: 'organization', roles: ['org_admin'] }],
      { organizationId: project.ownerOrganizationId },
    );
  }

  // ─── Files ────────────────────────────────────────────────────────────────────

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async uploadSectionFiles(sectionId: number, files: Express.Multer.File[]) {
    const section = await this.prisma.studySection.findUnique({
      where: { id: sectionId },
      include: { study: { select: { projectId: true } } },
    });
    if (!section) throw new NotFoundException(`Section #${sectionId} not found`);
    await this.tenancy.assertProjectVisible(section.study.projectId); // W2 isolation

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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async deleteSectionFile(fileId: number) {
    const file = await this.prisma.studySectionFile.findUnique({
      where: { id: fileId },
      include: { section: { select: { study: { select: { projectId: true } } } } },
    });
    if (!file) throw new NotFoundException(`File #${fileId} not found`);
    await this.tenancy.assertProjectVisible(file.section.study.projectId); // W2 isolation

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
    actor: ActorContext,
    studyId: number,
    dto: ChangeStudyStatusDto,
    adminId: number,
    adminRole: string,
  ) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);
    await this.tenancy.assertProjectVisible(study.projectId); // W2 isolation

    const allowed = VALID_TRANSITIONS[study.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${study.status}" to "${dto.status}"`,
      );
    }

    if (GOVERNANCE_TARGETS.has(dto.status)) {
      if (policyEnforced()) {
        const verdict = await this.policy.can(actor, 'study.govern', {});
        if (!verdict.allow) {
          throw new ForbiddenException('Only Board governance roles can perform this status change');
        }
      } else if (adminRole !== AdminRole.administrator) {
        throw new ForbiddenException('Only administrators can perform this status change');
      }
    }

    if (dto.status === StudyStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    // W3-E4-S1: approvals/rejections route through the governance service —
    // an immutable BoardDecision is recorded and the legacy columns are
    // synced from it (new→old, 09). No non-decision approval path remains.
    if (dto.status === StudyStatus.approved || dto.status === StudyStatus.rejected) {
      const rationale =
        dto.status === StudyStatus.rejected
          ? dto.rejectionReason!
          : dto.rationale?.trim() ||
            'Routine approval — study review complete (templated rationale).';
      const { study: updatedStudy } = await this.governance.decideStudy(
        actor,
        studyId,
        dto.status === StudyStatus.approved ? 'approved' : 'rejected',
        rationale,
      );
      this.fireStatusEvent(actor, dto, updatedStudy, study.projectId);
      this.fireStatusNotification(dto.status, studyId, study.projectId, adminId, dto.rejectionReason);
      return updatedStudy;
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
    if (dto.rejectionReason) updateData.rejectionReason = dto.rejectionReason;

    let updatedStudy: typeof study;
    if (workflowEnforced('study')) {
      // W4-E4-S2: the engine drives the transition; the legacy columns are
      // synced inside the engine transaction (bridge). Effects the service
      // still emits itself (exact legacy payloads) are suppressed;
      // vote_round.create/close stay live and drive the round subscriber.
      const action = StudyService.ACTION_MAP[`${study.status}>${dto.status}`];
      await this.workflow.ensurePositionedInstance(
        { subjectType: 'project', subjectId: study.projectId },
        study.status,
      );
      await this.workflow.execute(actor, { subjectType: 'project', subjectId: study.projectId }, action, {
        payload: updateData.votingEndsAt ? { votingEndsAt: updateData.votingEndsAt } : undefined,
        suppressEffects: ['study.published', 'voting.opened', 'voting.closed'],
        sync: async (tx) => {
          await tx.projectStudy.update({ where: { id: studyId }, data: updateData });
          await tx.project.update({ where: { id: study.projectId }, data: { studyStatus: dto.status } });
        },
      });
      updatedStudy = (await this.prisma.projectStudy.findUnique({ where: { id: studyId } }))!;
    } else {
      // Keep Project.studyStatus mirrored
      [updatedStudy] = await this.prisma.$transaction([
        this.prisma.projectStudy.update({ where: { id: studyId }, data: updateData }),
        this.prisma.project.update({
          where: { id: study.projectId },
          data: { studyStatus: dto.status },
        }),
      ]);
    }

    // W3: voting transitions keep their contract; the VoteRound is the new
    // representation. Engine mode: the vote_round.create/close effects drive
    // the round subscriber instead of this direct call.
    if (!workflowEnforced('study')) {
      await this.governance.syncRoundOnStudyStatus(
        actor,
        updatedStudy,
        dto.status,
        dto.status === StudyStatus.voting_open ? (updatedStudy.votingEndsAt ?? undefined) : undefined,
      );
    }

    // Emit after the transaction committed
    this.fireStatusEvent(actor, dto, updatedStudy, study.projectId);

    // Fire async notifications — non-blocking
    this.fireStatusNotification(dto.status, studyId, study.projectId, adminId, dto.rejectionReason);

    return updatedStudy;
  }

  private fireStatusEvent(
    actor: ActorContext,
    dto: ChangeStudyStatusDto,
    study: { id: number; votingStartsAt: Date | null; votingEndsAt: Date | null },
    projectId: number,
  ) {
    const eventByStatus: Partial<Record<StudyStatus, string>> = {
      [StudyStatus.published]: 'study.published',
      [StudyStatus.approved]: 'study.approved',
      [StudyStatus.rejected]: 'study.rejected',
      [StudyStatus.voting_open]: 'voting.opened',
      [StudyStatus.voting_closed]: 'voting.closed',
    };
    const event = eventByStatus[dto.status];
    if (!event) return; // draft / in_review transitions are not announced

    const data: Record<string, unknown> = { projectId, status: dto.status };
    if (dto.status === StudyStatus.rejected) data.rejectionReason = dto.rejectionReason;
    if (dto.status === StudyStatus.voting_open) {
      data.votingStartsAt = study.votingStartsAt?.toISOString() ?? null;
      data.votingEndsAt = study.votingEndsAt?.toISOString() ?? null;
    }

    this.eventBus.publish({
      event,
      actor,
      subject: { type: 'study', id: study.id },
      data,
    });
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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async deleteStudy(actor: ActorContext, studyId: number) {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);
    await this.tenancy.assertProjectVisible(study.projectId); // W2 isolation
    if (study.status !== StudyStatus.draft) {
      throw new BadRequestException('Only draft studies can be deleted');
    }

    // Sections (and votes) no longer cascade (W0-E4-S1: domain relations are
    // Restrict) — delete children explicitly inside the same transaction.
    // W3: the aggregate now includes governance rounds/votes; legacy frozen
    // StudyVote rows (pre-cutover) go with them.
    const rounds = await this.prisma.voteRound.findMany({
      where: { subjectType: 'project_study', subjectId: studyId },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.studySection.deleteMany({ where: { studyId } }),
      this.prisma.vote.deleteMany({ where: { voteRoundId: { in: rounds.map((r) => r.id) } } }),
      this.prisma.voteRound.deleteMany({ where: { id: { in: rounds.map((r) => r.id) } } }),
      this.prisma.studyVote.deleteMany({ where: { studyId } }),
      this.prisma.projectStudy.delete({ where: { id: studyId } }),
      this.prisma.project.update({
        where: { id: study.projectId },
        data: { studyStatus: null },
      }),
    ]);

    this.eventBus.publish({
      event: 'study.deleted',
      actor,
      subject: { type: 'study', id: studyId },
      data: { projectId: study.projectId },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async buildVotesSummary(studyId: number) {
    // W3-E3-S2: tallies read from the generalized VoteRound/Vote model — the
    // latest round is the current voting cycle (StudyVote is frozen).
    const round = await this.governance.latestRoundForStudy(studyId);
    if (!round) return { for: 0, against: 0, abstain: 0, total: 0 };
    const groups = await this.prisma.vote.groupBy({
      by: ['choice'],
      where: { voteRoundId: round.id },
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
