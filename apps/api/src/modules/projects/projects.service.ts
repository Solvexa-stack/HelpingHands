import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { AdminRole } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { ActorContext } from '../../events/actor-context';
import { ActorContextService } from '../../events/actor-context.storage';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { WorkflowService } from '../workflow/workflow.service';
import { workflowEnforced } from '../workflow/workflow.types';
import { CategoriesService } from '../categories/categories.service';
import { PolicyService } from '../policy/policy.service';

/**
 * W6 addendum — cutover flag for the fund-of-record requirement. OFF by
 * default: existing projects and API consumers keep working through the
 * nullable-column backfill window; flip to 'true' only after the backfill
 * is verified (09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md — "adding a truth").
 */
export function projectFundRequired(): boolean {
  return process.env.PROJECT_FUND_REQUIRED === 'true';
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private actorContext: ActorContextService,
    private tenancy: TenancyRepository,
    private workflow: WorkflowService,
    private categories: CategoriesService,
    private policy: PolicyService,
  ) {}

  async findAll(query: ProjectQueryDto, userRole?: string, financialOfficerId?: number) {
    const { page = 1, limit = 15, category, categoryKey, location, search, isCompleted, lang, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    // W6-E2: category filters resolve through the taxonomy — a node matches
    // itself and its descendants; the legacy enum param maps to its node.
    if (categoryKey) {
      const node = await this.categories.byKey(categoryKey);
      where.categoryId = { in: await this.categories.selfAndDescendantIds(node.id) };
    } else if (category) {
      const node = await this.categories.resolveForWrite({ category });
      where.categoryId = { in: await this.categories.selfAndDescendantIds(node) };
    }
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (typeof isCompleted === 'boolean') where.isCompleted = isCompleted;

    // Financial officers only see their assigned projects
    if (userRole === AdminRole.financial_officer && financialOfficerId) {
      where.financialOfficerId = financialOfficerId;
    }

    if (search) {
      where.block = {
        translations: {
          some: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { brief: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    const validSortFields: Record<string, any> = {
      createdAt: { createdAt: sortOrder },
      value: { value: sortOrder },
      progression: { progression: sortOrder },
    };

    const scopedWhere = await this.tenancy.enforcedProjectWhere(where); // W2-E3-S1

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where: scopedWhere,
        skip,
        take,
        orderBy: validSortFields[sortBy] || { createdAt: sortOrder },
        include: {
          block: {
            include: {
              translations: lang ? { where: { languageCode: lang } } : true,
              files: { where: { isActive: true, isCover: true }, take: 1 },
            },
          },
          financialOfficer: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { donations: true } },
          study: { select: { id: true, status: true } },
          categoryNode: { select: { id: true, key: true, name: true, nameAr: true, nameFr: true, parentId: true } },
          primaryFund: { select: { id: true, name: true } },
        },
      }),
      this.prisma.project.count({ where: scopedWhere }),
    ]);

    const mapped = data.map(({ study, ...project }) => ({
      ...project,
      studyId: study?.id ?? null,
      studyStatus: study?.status ?? null,
    }));

    return paginatedResponse(mapped, total, page, limit);
  }

  async findById(id: number, lang?: string) {
    await this.tenancy.assertProjectVisible(id); // W2-E3-S1
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        block: {
          include: {
            translations: lang ? { where: { languageCode: lang } } : true,
            files: { where: { isActive: true }, orderBy: [{ isCover: 'desc' }, { orderId: 'asc' }] },
          },
        },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { donations: true } },
        donations: {
          where: { status: 'approved' },
          select: { amount: true },
        },
        study: { select: { id: true, status: true } },
        categoryNode: { select: { id: true, key: true, name: true, nameAr: true, nameFr: true, parentId: true } },
        primaryFund: { select: { id: true, name: true } },
        // W6-E1-S1 AC: the project detail API exposes participations
        participations: {
          where: { deletedAt: null },
          orderBy: { id: 'asc' },
          include: { organization: { select: { id: true, name: true, type: true, status: true } } },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project #${id} not found`);

    const collectedAmount = project.donations.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );

    const { study, ...rest } = project;
    return { ...rest, collectedAmount, studyId: study?.id ?? null, studyStatus: study?.status ?? null };
  }

  async create(actor: ActorContext, dto: CreateProjectDto) {
    const block = await this.prisma.block.findUnique({ where: { id: dto.blockId } });
    if (!block) throw new NotFoundException(`Block #${dto.blockId} not found`);

    const existing = await this.prisma.project.findUnique({ where: { blockId: dto.blockId } });
    if (existing) throw new BadRequestException('This block already has a project');

    if (dto.financialOfficerId) {
      const officer = await this.prisma.admin.findFirst({
        where: { id: dto.financialOfficerId, role: AdminRole.financial_officer },
      });
      if (!officer) throw new NotFoundException(`Financial officer #${dto.financialOfficerId} not found`);
    }

    // W6-E2: taxonomy node resolved from categoryId | categoryKey | legacy
    // enum value; the frozen enum column is never written.
    const categoryId = await this.categories.resolveForWrite(dto);

    // W6-E4-S2: the emergency-relief fast track is Board-initiated only
    if (dto.lifecycle === 'emergency-relief') {
      const decision = await this.policy.can(actor, 'project.emergency.create', {});
      if (!decision.allow) {
        throw new ForbiddenException('Only the Board may initiate emergency-relief projects');
      }
    }

    // W2 isolation: ownership follows the actor's active workspace — never
    // the request body. Actors without an org context (system/backfill)
    // fall back to the default org.
    const ownerOrganizationId = actor.activeOrgId ?? (await this.getDefaultOrganizationId());

    // W6 addendum — fund of record: identity attribution, validated the same
    // way ownerOrganizationId's counterpart (the Fund) already is elsewhere —
    // must exist and be active. Distinct from FundAllocation (financing,
    // proposed later, many funds allowed); this is the single administrative
    // fund a citizen-facing page attributes the project to.
    let primaryFundId: number | undefined;
    if (dto.fundId != null) {
      const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
      if (!fund) throw new NotFoundException(`Fund #${dto.fundId} not found`);
      if (fund.status !== 'active') {
        throw new BadRequestException(`Fund is ${fund.status} — only active funds can be selected`);
      }
      primaryFundId = dto.fundId;
    } else if (projectFundRequired()) {
      throw new BadRequestException('A fund must be selected for new projects');
    }

    const project = await this.prisma.project.create({
      data: {
        blockId: dto.blockId,
        location: dto.location,
        value: dto.value,
        categoryId,
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : undefined,
        dateOfCompletion: dto.dateOfCompletion ? new Date(dto.dateOfCompletion) : undefined,
        financialOfficerId: dto.financialOfficerId,
        ownerOrganizationId,
        primaryFundId,
      },
      include: {
        block: { include: { translations: true } },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
        categoryNode: { select: { id: true, key: true, name: true } },
        primaryFund: { select: { id: true, name: true } },
      },
    });

    this.eventBus.publish({
      event: 'project.created',
      actor,
      subject: { type: 'project', id: project.id },
      data: { blockId: project.blockId, category: project.categoryNode?.key ?? null, value: Number(project.value) },
    });

    // W4: every project lives on the engine from birth. W6-E4-S1: the
    // definition is selected by owner-org capabilities — oversight-flagged
    // orgs start on project-lifecycle v2 (board_review); everyone else stays
    // on v1. Board-initiated emergency projects run the fast-track definition.
    const definitionKey = dto.lifecycle === 'emergency-relief' ? 'emergency-relief' : 'project-lifecycle';
    const version =
      definitionKey === 'project-lifecycle'
        ? (await this.requiresBoardOversight(ownerOrganizationId)) ? 2 : 1
        : undefined;
    await this.workflow
      .start(actor, { subjectType: 'project', subjectId: project.id }, definitionKey, { version })
      .catch(() => null); // never block creation on the lifecycle record

    return project;
  }

  private async requiresBoardOversight(organizationId: number): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { capabilities: true },
    });
    return (org?.capabilities as Record<string, unknown> | null)?.requiresBoardOversight === true;
  }

  /**
   * W6 addendum — mirrors GuardRegistryService's board_decision subject
   * resolution: a project with a study decides on that study; a study-less
   * project (emergency-relief fast track) decides on itself.
   */
  private async hasApprovedBoardDecision(projectId: number): Promise<boolean> {
    const study = await this.prisma.projectStudy.findUnique({
      where: { projectId },
      select: { id: true },
    });
    const decision = await this.prisma.boardDecision.findFirst({
      where: study
        ? { subjectType: 'project_study', subjectId: study.id, decision: 'approved' }
        : { subjectType: 'project', subjectId: projectId, decision: 'approved' },
    });
    return decision != null;
  }

  async update(actor: ActorContext, id: number, dto: UpdateProjectDto) {
    await this.tenancy.assertProjectVisible(id); // W2 isolation: writes are org-scoped too
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    if (project.isCompleted) throw new BadRequestException('Completed projects cannot be modified');

    // category/categoryKey/lifecycle/fundId are virtual inputs: the frozen
    // enum column is never written; category changes resolve to categoryId;
    // fundId maps onto the primaryFundId identity column.
    const { blockId, category, categoryKey, categoryId: dtoCategoryId, lifecycle, fundId, ...updateData } = dto;
    const categoryId =
      dtoCategoryId != null || categoryKey || category
        ? await this.categories.resolveForWrite({ categoryId: dtoCategoryId, categoryKey, category })
        : undefined;

    // W6 addendum — fund of record is locked once the project has an
    // approved Board decision (same decision-subject resolution the workflow
    // engine's board_decision guard uses: project_study if one exists, else
    // the project itself). Everything else stays editable.
    if (fundId !== undefined && fundId !== project.primaryFundId) {
      if (await this.hasApprovedBoardDecision(id)) {
        throw new ForbiddenException('Fund of record is locked after Board approval');
      }
    }
    const primaryFundId = fundId;
    if (primaryFundId != null) {
      const fund = await this.prisma.fund.findUnique({ where: { id: primaryFundId } });
      if (!fund) throw new NotFoundException(`Fund #${primaryFundId} not found`);
      if (fund.status !== 'active') {
        throw new BadRequestException(`Fund is ${fund.status} — only active funds can be selected`);
      }
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...updateData,
        categoryId,
        primaryFundId,
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : undefined,
        dateOfCompletion: dto.dateOfCompletion ? new Date(dto.dateOfCompletion) : undefined,
      },
      include: {
        block: { include: { translations: true } },
        financialOfficer: { select: { id: true, firstName: true, lastName: true } },
        categoryNode: { select: { id: true, key: true, name: true } },
        primaryFund: { select: { id: true, name: true } },
      },
    });

    this.eventBus.publish({
      event: 'project.updated',
      actor,
      subject: { type: 'project', id },
      data: { changedFields: Object.keys(updateData) },
    });

    return updated;
  }

  async remove(actor: ActorContext, id: number) {
    await this.tenancy.assertProjectVisible(id); // W2 isolation: writes are org-scoped too
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    // W4: the lifecycle instance is part of the aggregate
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: id } },
    });
    if (instance) {
      await this.prisma.workflowStepLog.deleteMany({ where: { instanceId: instance.id } });
      await this.prisma.workflowInstance.delete({ where: { id: instance.id } });
    }
    await this.prisma.project.delete({ where: { id } });

    this.eventBus.publish({
      event: 'project.deleted',
      actor,
      subject: { type: 'project', id },
      data: { blockId: project.blockId },
    });
  }

  /** Resolved once per process; ids are stable within a database lifetime. */
  private defaultOrganizationId: number | null = null;

  private async getDefaultOrganizationId(): Promise<number> {
    if (this.defaultOrganizationId !== null) return this.defaultOrganizationId;
    const org = await this.prisma.organization.findFirst({
      where: { type: 'ngo', name: 'HelpingHands' },
    });
    if (!org) {
      throw new Error('Default organization missing — run the W1-E3 backfill migration/seed');
    }
    this.defaultOrganizationId = org.id;
    return org.id;
  }

  async recalculateProgress(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    const [cashResult, onlineResult] = await Promise.all([
      this.prisma.projectDonation.aggregate({
        where: { projectId, status: 'approved' },
        _sum: { amount: true },
      }),
      this.prisma.onlineDonation.aggregate({
        where: { projectId, status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    const collected =
      Number(cashResult._sum.amount ?? 0) + Number(onlineResult._sum.amount ?? 0);
    const value = Number(project.value);
    const progression = value > 0 ? Math.min((collected / value) * 100, 100) : 0;
    const isCompleted = collected >= value;

    await this.prisma.project.update({
      where: { id: projectId },
      data: { progression, isCompleted },
    });

    // Funding goal reached for the first time → the project closes.
    // Actor comes from ALS: the approving staff member in request contexts,
    // anonymous/system for webhook- or job-triggered recalculations.
    if (isCompleted && !project.isCompleted) {
      this.eventBus.publish({
        event: 'project.closed',
        actor: this.actorContext.currentOrSystem(),
        subject: { type: 'project', id: projectId },
        data: { value, collected, progression },
      });

      // W4-E4-S4: closure runs through the engine — 'complete' is reachable
      // from every non-terminal state (funding can finish at any stage)
      if (workflowEnforced('execution')) {
        await this.workflow
          .execute(this.actorContext.currentOrSystem(), { subjectType: 'project', subjectId: projectId }, 'complete', {
            note: `funding goal reached (${collected}/${value})`,
          })
          .catch(() => null); // bridge keeps isCompleted authoritative; parity job watches drift
      }
    }
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async assignFinancialOfficer(projectId: number, officerId: number) {
    const [project, officer] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.admin.findFirst({ where: { id: officerId, role: AdminRole.financial_officer } }),
    ]);

    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    if (!officer) throw new NotFoundException(`Financial officer #${officerId} not found`);

    return this.prisma.project.update({
      where: { id: projectId },
      data: { financialOfficerId: officerId },
    });
  }
}
