import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardRef, GuardVerdict, WorkflowSubject } from './workflow.types';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * W4-E1-S3 — guard-handler registry. Guard TYPES are code; which guards apply
 * where is transition data. Role/capability checks delegate to the policy
 * engine (08: one authorization brain, two entry points). System actors
 * (cron, funding recalculation — userId null) pass role guards: they are the
 * platform acting on schedule, exactly as the legacy cron paths behave.
 */
@Injectable()
export class GuardRegistryService {
  constructor(
    private prisma: PrismaService,
    private policy: PolicyService,
  ) {}

  async evaluate(
    guard: GuardRef,
    actor: ActorContext,
    subject: WorkflowSubject,
    db: Db = this.prisma,
  ): Promise<GuardVerdict> {
    switch (guard.type) {
      case 'role':
        return this.role(guard, actor, subject, db);
      case 'capability':
        return this.capability(guard, subject, db);
      case 'vote_passed':
        return this.votePassed(subject, db);
      case 'board_decision':
        return this.boardDecision(guard, subject, db);
      case 'sections_complete':
        return this.sectionsComplete(subject, db);
      case 'window_open':
        return this.windowOpen(guard, subject, db);
      default:
        return { pass: false, reason: `denied:unknown-guard:${(guard as { type: string }).type}` };
    }
  }

  private async role(
    guard: Extract<GuardRef, { type: 'role' }>,
    actor: ActorContext,
    subject: WorkflowSubject,
    db: Db,
  ): Promise<GuardVerdict> {
    if (actor.userId == null) return { pass: true, reason: 'granted:system-actor' };
    const organizationId = await this.owningOrgId(subject, db);
    const fundId = await this.owningFundId(subject, db);
    const holds = await this.policy.holdsAnyGrant(actor.userId, guard.anyOf, { organizationId, fundId });
    return holds
      ? { pass: true, reason: 'granted:role' }
      : { pass: false, reason: `denied:role:${guard.anyOf.map((r) => `${r.scope}[${r.roles.join('|')}]`).join(' or ')}` };
  }

  private async capability(
    guard: Extract<GuardRef, { type: 'capability' }>,
    subject: WorkflowSubject,
    db: Db,
  ): Promise<GuardVerdict> {
    const organizationId = await this.owningOrgId(subject, db);
    if (organizationId == null) return { pass: false, reason: 'denied:capability:no-owning-org' };
    const org = await db.organization.findUnique({ where: { id: organizationId } });
    const capabilities = (org?.capabilities ?? {}) as Record<string, unknown>;
    return capabilities[guard.cap] === true
      ? { pass: true, reason: `granted:capability:${guard.cap}` }
      : { pass: false, reason: `denied:capability:${guard.cap}` };
  }

  /** Latest round for the subject's study: fails only on an explicit negative result. */
  private async votePassed(subject: WorkflowSubject, db: Db): Promise<GuardVerdict> {
    const studyId = await this.studyIdOf(subject, db);
    if (studyId == null) return { pass: true, reason: 'granted:vote_passed:no-voting-data' };
    const round = await db.voteRound.findFirst({
      where: { subjectType: 'project_study', subjectId: studyId },
      orderBy: { id: 'desc' },
    });
    if (!round) return { pass: true, reason: 'granted:vote_passed:no-round' };
    const passed = (round.result as { passed?: boolean | null } | null)?.passed;
    // v1 rounds carry no quorum/threshold rules → passed is null → recorded,
    // not deciding (exact transcription of today's human-decides behavior)
    return passed === false
      ? { pass: false, reason: 'denied:vote_passed:round-failed' }
      : { pass: true, reason: 'granted:vote_passed' };
  }

  private async boardDecision(
    guard: Extract<GuardRef, { type: 'board_decision' }>,
    subject: WorkflowSubject,
    db: Db,
  ): Promise<GuardVerdict> {
    // project subjects decide on their study; other subjects decide on themselves
    let decisionSubject: { subjectType: string; subjectId: number } | null = null;
    if (subject.subjectType === 'project') {
      const studyId = await this.studyIdOf(subject, db);
      if (studyId != null) decisionSubject = { subjectType: 'project_study', subjectId: studyId };
    } else {
      decisionSubject = { subjectType: subject.subjectType, subjectId: subject.subjectId };
    }
    if (!decisionSubject) return { pass: false, reason: `denied:board_decision:${guard.decision}:no-subject` };

    const decision = await db.boardDecision.findFirst({
      where: {
        subjectType: decisionSubject.subjectType as never,
        subjectId: decisionSubject.subjectId,
        decision: guard.decision,
      },
      orderBy: { decidedAt: 'desc' },
    });
    return decision
      ? { pass: true, reason: `granted:board_decision:${guard.decision}` }
      : { pass: false, reason: `denied:board_decision:${guard.decision}-missing` };
  }

  private async sectionsComplete(subject: WorkflowSubject, db: Db): Promise<GuardVerdict> {
    const studyId = await this.studyIdOf(subject, db);
    if (studyId == null) return { pass: false, reason: 'denied:sections_complete:no-study' };
    const pending = await db.studySection.count({
      where: { studyId, isRequired: true, status: { not: 'completed' } },
    });
    return pending === 0
      ? { pass: true, reason: 'granted:sections_complete' }
      : { pass: false, reason: `denied:sections_complete:${pending}-pending` };
  }

  private async windowOpen(
    guard: Extract<GuardRef, { type: 'window_open' }>,
    subject: WorkflowSubject,
    db: Db,
  ): Promise<GuardVerdict> {
    const studyId = await this.studyIdOf(subject, db);
    if (studyId == null) return { pass: false, reason: 'denied:window_open:no-study' };
    const study = await db.projectStudy.findUnique({ where: { id: studyId } });
    const now = new Date();
    const started = study?.votingStartsAt != null && study.votingStartsAt <= now;
    const ended = study?.votingEndsAt != null && study.votingEndsAt < now;
    const open = started && !ended;
    if (guard.mustBeClosed) {
      return ended
        ? { pass: true, reason: 'granted:window_closed' }
        : { pass: false, reason: 'denied:window_open:still-open' };
    }
    return open
      ? { pass: true, reason: 'granted:window_open' }
      : { pass: false, reason: 'denied:window_open:closed' };
  }

  // ─── Subject resolution ───────────────────────────────────────────────────────

  private async owningOrgId(subject: WorkflowSubject, db: Db): Promise<number | null> {
    if (subject.subjectType === 'project') {
      const project = await db.project.findUnique({
        where: { id: subject.subjectId },
        select: { ownerOrganizationId: true },
      });
      return project?.ownerOrganizationId ?? null;
    }
    if (subject.subjectType === 'organization') return subject.subjectId;
    return null;
  }

  private async owningFundId(subject: WorkflowSubject, db: Db): Promise<number | null> {
    if (subject.subjectType !== 'fund_allocation') return null;
    const allocation = await db.fundAllocation.findUnique({
      where: { id: subject.subjectId },
      select: { fundId: true },
    });
    return allocation?.fundId ?? null;
  }

  private async studyIdOf(subject: WorkflowSubject, db: Db): Promise<number | null> {
    if (subject.subjectType !== 'project') return null;
    const study = await db.projectStudy.findUnique({
      where: { projectId: subject.subjectId },
      select: { id: true },
    });
    return study?.id ?? null;
  }
}
