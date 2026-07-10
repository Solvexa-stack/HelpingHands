import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BoardDecisionType,
  Prisma,
  ProjectStudy,
  StudyStatus,
  VoteChoice,
  VoteRound,
} from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CastRoundVoteDto, DecisionQueryDto, OpenRoundDto, RecordDecisionDto } from './dto/governance.dto';
import { WorkflowService } from '../workflow/workflow.service';
import { workflowEnforced } from '../workflow/workflow.types';

/** Roles that may cast a vote in a board-eligibility round (07: secretary/auditor do not vote). */
const BOARD_VOTING_ROLES = ['board_chair', 'board_member'];

export interface RoundTally {
  for: number;
  against: number;
  abstain: number;
  total: number;
  passed: boolean | null;
}

/**
 * W3-E2 — the governance module: immutable decision records, generalized
 * vote-round lifecycle, and the Board review queue. Decisions and votes are
 * append-only: this service exposes no update or delete path (the one
 * compatibility exception — legacy change-vote on an OPEN round — lives in
 * the voting module and is retired in Wave 8).
 */
@Injectable()
export class GovernanceService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationsService: NotificationsService,
    private workflow: WorkflowService,
  ) {}

  // ─── Decisions (W3-E2-S1 / W3-E4) ─────────────────────────────────────────────

  async recordDecision(actor: ActorContext, dto: RecordDecisionDto) {
    if (dto.subjectType === 'project_study') {
      const { decision } = await this.decideStudy(actor, dto.subjectId, dto.decision, dto.rationale, {
        sessionRef: dto.sessionRef,
        voteRoundId: dto.voteRoundId,
      });
      return decision;
    }

    // Generic subjects (project | fund_allocation | organization | policy):
    // record only — consumers arrive with Waves 4/5/6 workflow guards.
    await this.assertSubjectExists(dto.subjectType, dto.subjectId);
    const decision = await this.prisma.boardDecision.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        decision: dto.decision,
        rationale: dto.rationale,
        decidedById: actor.userId!,
        sessionRef: dto.sessionRef,
        voteRoundId: dto.voteRoundId,
      },
    });
    this.emitDecisionRecorded(actor, decision);
    return decision;
  }

  /**
   * W3-E4-S1/S3 — the single decision path for studies. Creates the immutable
   * BoardDecision and syncs the legacy columns from it (new→old, 09) in one
   * transaction:
   *   approved          → study.approved (+ approvedBy columns)
   *   rejected          → study.rejected (+ rejectionReason = rationale)
   *   changes_requested → study back to draft (revision; org edits & resubmits)
   */
  async decideStudy(
    actor: ActorContext,
    studyId: number,
    decisionType: BoardDecisionType,
    rationale: string,
    opts: { sessionRef?: string; voteRoundId?: number } = {},
  ): Promise<{ decision: Prisma.BoardDecisionGetPayload<object>; study: ProjectStudy }> {
    const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException(`Study #${studyId} not found`);

    const validSources: Record<BoardDecisionType, StudyStatus[]> = {
      approved: [StudyStatus.voting_closed],
      rejected: [StudyStatus.voting_closed],
      changes_requested: [StudyStatus.in_review, StudyStatus.voting_closed],
    };
    if (!validSources[decisionType].includes(study.status)) {
      throw new BadRequestException(
        `Cannot record "${decisionType}" while the study is "${study.status}"`,
      );
    }

    const targetStatus: StudyStatus =
      decisionType === 'approved'
        ? StudyStatus.approved
        : decisionType === 'rejected'
          ? StudyStatus.rejected
          : StudyStatus.draft; // revision

    const adminId =
      actor.referenceType === 'admin'
        ? (await this.prisma.user.findUnique({ where: { id: actor.userId! } }))?.referenceId
        : undefined;

    const round =
      opts.voteRoundId ??
      (
        await this.prisma.voteRound.findFirst({
          where: { subjectType: 'project_study', subjectId: studyId },
          orderBy: { id: 'desc' },
        })
      )?.id ??
      null;

    const legacySync: Prisma.ProjectStudyUpdateInput = { status: targetStatus };
    if (decisionType === 'approved') {
      legacySync.approvedBy = adminId ? { connect: { id: adminId } } : undefined;
      legacySync.approvedByUser = actor.userId ? { connect: { id: actor.userId } } : undefined;
      legacySync.approvedAt = new Date();
    }
    if (decisionType === 'rejected' || decisionType === 'changes_requested') {
      legacySync.rejectionReason = rationale;
    }

    let decision: Prisma.BoardDecisionGetPayload<object>;
    let updatedStudy: ProjectStudy;
    if (workflowEnforced('study')) {
      // W4-E4-S2: the decision row lands first (it is the transition's
      // board_decision guard input), then the engine moves the state with the
      // legacy sync riding the same transaction. Approval chains into
      // open_donations — 'approved' is transient, matching the backfill rule.
      decision = await this.prisma.boardDecision.create({
        data: {
          subjectType: 'project_study',
          subjectId: studyId,
          decision: decisionType,
          rationale,
          decidedById: actor.userId!,
          sessionRef: opts.sessionRef,
          voteRoundId: round,
        },
      });
      let action =
        decisionType === 'approved' ? 'approve' : decisionType === 'rejected' ? 'reject' : 'request_changes';
      await this.workflow.ensurePositionedInstance(
        { subjectType: 'project', subjectId: study.projectId },
        study.status,
      );
      // W6-E4-S1: v2 (oversight orgs) inserts an explicit board_review station
      // between voting_closed and the decision; legacy study statuses have no
      // equivalent, so the hop happens here, inside the single decision path.
      const instance = await this.workflow.instanceFor({ subjectType: 'project', subjectId: study.projectId });
      const isV2 = instance?.definition.key === 'project-lifecycle' && instance.definition.version >= 2;
      if (isV2 && instance!.currentStateKey === 'voting_closed') {
        await this.workflow.execute(actor, { subjectType: 'project', subjectId: study.projectId }, 'send_to_board', {
          note: `board decision #${decision.id}`,
        });
      }
      if (isV2 && decisionType === 'changes_requested' && instance!.currentStateKey === 'in_review') {
        action = 'revise'; // v2 carries request_changes only from board_review
      }
      await this.workflow.execute(actor, { subjectType: 'project', subjectId: study.projectId }, action, {
        note: `board decision #${decision.id}`,
        suppressEffects: ['study.approved', 'study.rejected'],
        sync: async (tx) => {
          await tx.projectStudy.update({ where: { id: studyId }, data: legacySync });
          await tx.project.update({ where: { id: study.projectId }, data: { studyStatus: targetStatus } });
        },
      });
      if (decisionType === 'approved' && (!isV2 || (await this.orgCanOpenDonations(study.projectId)))) {
        await this.workflow.execute(
          actor,
          { subjectType: 'project', subjectId: study.projectId },
          'open_donations',
          {
            note: isV2
              ? 'owner org holds canOpenDonations — approval opens donations'
              : 'donations were never study-gated in v1 — approval opens them',
          },
        );
      }
      updatedStudy = (await this.prisma.projectStudy.findUnique({ where: { id: studyId } }))!;
    } else {
      [decision, updatedStudy] = await this.prisma.$transaction([
        this.prisma.boardDecision.create({
          data: {
            subjectType: 'project_study',
            subjectId: studyId,
            decision: decisionType,
            rationale,
            decidedById: actor.userId!,
            sessionRef: opts.sessionRef,
            voteRoundId: round,
          },
        }),
        this.prisma.projectStudy.update({ where: { id: studyId }, data: legacySync }),
        this.prisma.project.update({
          where: { id: study.projectId },
          data: { studyStatus: targetStatus },
        }),
      ]).then(([d, s]) => [d, s] as const);
    }

    this.emitDecisionRecorded(actor, decision);

    if (decisionType === 'changes_requested') {
      this.notificationsService
        .notify({ type: 'study_changes_requested', studyId, projectId: study.projectId })
        .catch(() => null);
    }

    return { decision, study: updatedStudy };
  }

  async listDecisions(query: DecisionQueryDto) {
    const where: Prisma.BoardDecisionWhereInput = {};
    if (query.subjectType) where.subjectType = query.subjectType;
    if (query.subjectId) where.subjectId = query.subjectId;
    return this.prisma.boardDecision.findMany({
      where,
      orderBy: { decidedAt: 'desc' },
      take: 200,
      include: {
        decidedBy: {
          select: { id: true, email: true, admin: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  /** Decisions on a study, oldest first — surfaced to the owning org on the study detail. */
  decisionsForStudy(studyId: number) {
    return this.prisma.boardDecision.findMany({
      where: { subjectType: 'project_study', subjectId: studyId },
      orderBy: { decidedAt: 'asc' },
      include: {
        decidedBy: {
          select: { id: true, email: true, admin: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  // ─── Vote rounds (W3-E2-S2) ───────────────────────────────────────────────────

  async openRound(actor: ActorContext, dto: OpenRoundDto): Promise<VoteRound> {
    await this.assertSubjectExists(dto.subjectType, dto.subjectId);
    const existing = await this.prisma.voteRound.findFirst({
      where: { subjectType: dto.subjectType, subjectId: dto.subjectId, status: 'open' },
    });
    if (existing) {
      throw new ConflictException('An open vote round already exists for this subject');
    }

    const round = await this.prisma.voteRound.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : new Date(),
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        eligibility: (dto.eligibility ?? { type: 'authenticated' }) as Prisma.InputJsonValue,
        rules: (dto.rules ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.eventBus.publish({
      event: 'vote_round.opened',
      actor,
      subject: { type: 'vote_round', id: round.id },
      data: { subjectType: dto.subjectType, subjectId: dto.subjectId, closesAt: round.closesAt },
    });
    return round;
  }

  async castVote(actor: ActorContext, roundId: number, dto: CastRoundVoteDto, userId: number) {
    const round = await this.prisma.voteRound.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException(`Vote round #${roundId} not found`);
    if (round.status !== 'open') throw new BadRequestException('This vote round is closed');
    const now = new Date();
    if (round.opensAt > now) throw new BadRequestException('This vote round has not opened yet');
    if (round.closesAt && round.closesAt < now) {
      throw new BadRequestException('Voting period has ended');
    }
    await this.assertEligible(round, userId);

    const vote = await this.prisma.vote
      .create({
        data: { voteRoundId: roundId, userId, choice: dto.choice, comment: dto.comment },
        include: { user: { select: { id: true, email: true } } },
      })
      .catch((err) => {
        if (err?.code === 'P2002') {
          throw new ConflictException('You have already voted in this round');
        }
        throw err;
      });

    this.eventBus.publish({
      event: 'vote.cast',
      actor,
      subject: { type: 'vote', id: vote.id },
      data: { voteRoundId: roundId, subjectType: round.subjectType, subjectId: round.subjectId, choice: dto.choice },
    });
    return vote;
  }

  async closeRound(actor: ActorContext, roundId: number): Promise<VoteRound> {
    const round = await this.prisma.voteRound.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException(`Vote round #${roundId} not found`);
    if (round.status !== 'open') throw new BadRequestException('This vote round is already closed');

    const result = await this.evaluateRound(round);
    const closed = await this.prisma.voteRound.update({
      where: { id: roundId },
      data: {
        status: 'closed',
        closesAt: round.closesAt && round.closesAt < new Date() ? round.closesAt : new Date(),
        result: result as unknown as Prisma.InputJsonValue,
      },
    });

    this.eventBus.publish({
      event: 'vote_round.closed',
      actor,
      subject: { type: 'vote_round', id: roundId },
      data: { subjectType: round.subjectType, subjectId: round.subjectId, result },
    });
    return closed;
  }

  async getRound(roundId: number) {
    const round = await this.prisma.voteRound.findUnique({
      where: { id: roundId },
      include: {
        votes: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                admin: { select: { firstName: true, lastName: true } },
                participant: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        decisions: true,
      },
    });
    if (!round) throw new NotFoundException(`Vote round #${roundId} not found`);
    const tally = round.status === 'closed' && round.result ? round.result : await this.tally(roundId);
    return { ...round, tally };
  }

  listRounds(subjectType?: string, subjectId?: number) {
    const where: Prisma.VoteRoundWhereInput = {};
    if (subjectType) where.subjectType = subjectType as never;
    if (subjectId) where.subjectId = subjectId;
    return this.prisma.voteRound.findMany({ where, orderBy: { id: 'desc' }, take: 100 });
  }

  /** Latest round for a study — the voting module's compatibility anchor. */
  latestRoundForStudy(studyId: number) {
    return this.prisma.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId },
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Round sync for legacy study-status transitions (voting_open/voting_closed
   * keep their endpoint contract; the round is the new representation).
   */
  async syncRoundOnStudyStatus(
    actor: ActorContext,
    study: { id: number; votingStartsAt: Date | null },
    status: StudyStatus,
    votingEndsAt?: Date | null,
  ): Promise<void> {
    if (status === StudyStatus.voting_open) {
      const open = await this.prisma.voteRound.findFirst({
        where: { subjectType: 'project_study', subjectId: study.id, status: 'open' },
      });
      if (open) {
        // voting_open re-applied to extend the deadline
        if (votingEndsAt !== undefined) {
          await this.prisma.voteRound.update({ where: { id: open.id }, data: { closesAt: votingEndsAt } });
        }
        return;
      }
      await this.openRound(actor, {
        subjectType: 'project_study',
        subjectId: study.id,
        opensAt: (study.votingStartsAt ?? new Date()).toISOString(),
        closesAt: votingEndsAt ? votingEndsAt.toISOString() : undefined,
      });
    }
    if (status === StudyStatus.voting_closed) {
      const open = await this.prisma.voteRound.findFirst({
        where: { subjectType: 'project_study', subjectId: study.id, status: 'open' },
      });
      if (open) await this.closeRound(actor, open.id);
    }
  }

  async tally(roundId: number): Promise<RoundTally> {
    const groups = await this.prisma.vote.groupBy({
      by: ['choice'],
      where: { voteRoundId: roundId },
      _count: { choice: true },
    });
    const tally: RoundTally = { for: 0, against: 0, abstain: 0, total: 0, passed: null };
    for (const g of groups) {
      tally[g.choice as VoteChoice] = g._count.choice;
      tally.total += g._count.choice;
    }
    return tally;
  }

  // ─── Review queue (W3-E5-S1 backend; W6 adds verifications) ─────────────────

  /** Cross-org Board inbox: studies awaiting review, in voting, or awaiting decision. */
  async reviewQueue() {
    const studies = await this.prisma.projectStudy.findMany({
      where: { status: { in: [StudyStatus.in_review, StudyStatus.voting_open, StudyStatus.voting_closed] } },
      orderBy: { updatedAt: 'asc' },
      include: {
        project: {
          select: {
            id: true,
            category: true,
            categoryNode: { select: { key: true, name: true } },
            value: true,
            ownerOrganization: { select: { id: true, name: true, type: true } },
            block: { select: { translations: { select: { languageCode: true, name: true } } } },
          },
        },
      },
    });

    const now = Date.now();
    return studies.map((s) => ({
      type: 'study' as const,
      studyId: s.id,
      status: s.status,
      projectId: s.project.id,
      projectName: s.project.block.translations[0]?.name ?? `#${s.project.id}`,
      category: s.project.categoryNode?.key ?? s.project.category,
      organization: s.project.ownerOrganization,
      votingEndsAt: s.votingEndsAt,
      ageDays: Math.floor((now - s.updatedAt.getTime()) / 86_400_000),
      waitingSince: s.updatedAt,
    }));
  }

  /** W6-E3-S2: pending registrations for the Board queue, with workflow state. */
  async verificationQueue() {
    const pending = await this.prisma.organization.findMany({
      where: { status: 'pending_verification', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const now = Date.now();
    const items = [] as Array<Record<string, unknown>>;
    for (const org of pending) {
      const instance = await this.prisma.workflowInstance.findUnique({
        where: { subjectType_subjectId: { subjectType: 'organization', subjectId: org.id } },
      });
      const documents = org.contentBlockId
        ? await this.prisma.file.count({
            where: { referenceType: 'organization', referenceId: org.contentBlockId, isActive: true },
          })
        : 0;
      items.push({
        type: 'verification' as const,
        organizationId: org.id,
        name: org.name,
        orgType: org.type,
        registrationNumber: org.registrationNumber,
        workflowState: instance?.currentStateKey ?? null,
        documentsOnFile: documents,
        ageDays: Math.floor((now - org.createdAt.getTime()) / 86_400_000),
        waitingSince: org.createdAt,
      });
    }
    return items;
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  /** W6-E4-S1: the v2 open_donations chain is capability-gated. */
  private async orgCanOpenDonations(projectId: number): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerOrganization: { select: { capabilities: true } } },
    });
    return (
      (project?.ownerOrganization.capabilities as Record<string, unknown> | null)?.canOpenDonations === true
    );
  }

  private emitDecisionRecorded(actor: ActorContext, decision: { id: number; subjectType: string; subjectId: number; decision: string; voteRoundId: number | null }) {
    this.eventBus.publish({
      event: 'board_decision.recorded',
      actor,
      subject: { type: 'board_decision', id: decision.id },
      data: {
        subjectType: decision.subjectType,
        subjectId: decision.subjectId,
        decision: decision.decision,
        voteRoundId: decision.voteRoundId,
      },
    });
  }

  private async assertSubjectExists(subjectType: string, subjectId: number): Promise<void> {
    if (subjectType === 'project_study') {
      const found = await this.prisma.projectStudy.findUnique({ where: { id: subjectId } });
      if (!found) throw new NotFoundException(`Study #${subjectId} not found`);
    } else if (subjectType === 'project') {
      const found = await this.prisma.project.findUnique({ where: { id: subjectId } });
      if (!found) throw new NotFoundException(`Project #${subjectId} not found`);
    } else if (subjectType === 'organization') {
      const found = await this.prisma.organization.findUnique({ where: { id: subjectId } });
      if (!found) throw new NotFoundException(`Organization #${subjectId} not found`);
    }
    // fund_allocation / policy subjects arrive with Waves 5/6
  }

  /** Eligibility policy evaluation (07): no electorate expansion this wave. */
  private async assertEligible(round: VoteRound, userId: number): Promise<void> {
    const eligibility = (round.eligibility ?? {}) as { type?: string; organizationId?: number };
    const type = eligibility.type ?? 'authenticated';

    if (type === 'authenticated') return; // transcription of current study voting

    if (type === 'board') {
      const grant = await this.prisma.roleAssignment.findFirst({
        where: { userId, scopeType: 'platform', role: { in: BOARD_VOTING_ROLES } },
      });
      if (!grant) throw new ForbiddenException('Only Board voting members are eligible in this round');
      return;
    }

    if (type === 'organization') {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { userId, organizationId: eligibility.organizationId ?? -1, status: 'active' },
      });
      if (!membership) throw new ForbiddenException('Only members of the organization are eligible in this round');
      return;
    }

    throw new BadRequestException(`Unknown eligibility policy "${type}"`);
  }

  /** Quorum/threshold evaluation; empty rules = tally only (humans decide — current behavior). */
  private async evaluateRound(round: VoteRound): Promise<RoundTally> {
    const tally = await this.tally(round.id);
    const rules = (round.rules ?? {}) as { quorum?: number; threshold?: number };
    if (rules.quorum !== undefined || rules.threshold !== undefined) {
      const quorumMet = tally.total >= (rules.quorum ?? 0);
      const decisive = tally.for + tally.against;
      const thresholdMet =
        decisive === 0 ? false : tally.for / decisive >= (rules.threshold ?? 0.5);
      tally.passed = quorumMet && thresholdMet;
    }
    return tally;
  }
}
