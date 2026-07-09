import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardRegistryService } from './guard-registry.service';
import { AvailableTransition, GuardRef, WorkflowSubject } from './workflow.types';

export interface ExecuteOptions {
  note?: string;
  payload?: Record<string, unknown>;
  /**
   * Compatibility bridge (W4-E4-S1, removed Wave 8): runs INSIDE the engine
   * transaction after the state move — the caller syncs its legacy enum
   * columns here so instance state and legacy columns can never diverge.
   */
  sync?: (tx: Prisma.TransactionClient) => Promise<void>;
  /**
   * Bridge-era effect dedup: effect events the calling service still emits
   * itself with their exact legacy payloads (parity). Listed names are not
   * re-emitted by the engine; the bridge's removal in Wave 8 makes the engine
   * the sole emitter.
   */
  suppressEffects?: string[];
}

/**
 * W4-E1-S2 — the three-operation engine (04): `start`, `availableTransitions`,
 * `execute`. Execute re-checks guards atomically under a row lock on the
 * instance, moves state, appends the WorkflowStepLog, syncs legacy columns
 * (bridge) — all in one DB transaction — and emits effects after commit.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private guards: GuardRegistryService,
  ) {}

  /** Create an instance at the definition's initial state. */
  async start(actor: ActorContext, subject: WorkflowSubject, definitionKey: string) {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { key: definitionKey, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!definition) throw new NotFoundException(`No active workflow definition "${definitionKey}"`);
    const initial = await this.prisma.workflowState.findFirst({
      where: { definitionId: definition.id, kind: 'initial' },
    });
    if (!initial) throw new NotFoundException(`Definition "${definitionKey}" has no initial state`);

    const instance = await this.prisma.workflowInstance
      .create({
        data: {
          definitionId: definition.id,
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          currentStateKey: initial.key,
        },
      })
      .catch((err) => {
        if (err?.code === 'P2002') {
          throw new ConflictException('Subject already has a workflow instance');
        }
        throw err;
      });
    await this.prisma.workflowStepLog.create({
      data: {
        instanceId: instance.id,
        fromStateKey: null,
        toStateKey: initial.key,
        actionKey: 'start',
        actorUserId: actor.userId,
      },
    });

    this.eventBus.publish({
      event: 'workflow_instance.started',
      actor,
      subject: { type: 'workflow_instance', id: instance.id },
      data: { ...subject, definition: definitionKey, version: definition.version, state: initial.key },
    });
    return instance;
  }

  /** Instance for a subject; lazily started for projects that predate the engine. */
  async instanceFor(subject: WorkflowSubject) {
    return this.prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: subject.subjectType, subjectId: subject.subjectId } },
      include: { definition: { select: { key: true, version: true } } },
    });
  }

  /** Transitions leaving the current state, guard-evaluated for this actor. */
  async availableTransitions(actor: ActorContext, subject: WorkflowSubject): Promise<AvailableTransition[]> {
    const instance = await this.instanceFor(subject);
    if (!instance) return [];
    const transitions = await this.prisma.workflowTransition.findMany({
      where: { definitionId: instance.definitionId, fromStateKey: instance.currentStateKey },
      orderBy: { id: 'asc' },
    });

    const results: AvailableTransition[] = [];
    for (const transition of transitions) {
      let deniedBy: string | null = null;
      for (const guard of (transition.guards as GuardRef[]) ?? []) {
        const verdict = await this.guards.evaluate(guard, actor, subject);
        if (!verdict.pass) {
          deniedBy = verdict.reason;
          break;
        }
      }
      results.push({
        actionKey: transition.actionKey,
        toStateKey: transition.toStateKey,
        allowed: deniedBy === null,
        deniedBy,
      });
    }
    return results;
  }

  /**
   * Atomically: row-lock the instance, re-check guards, move state, append
   * the step log, run the legacy sync bridge — one transaction. Effects and
   * `workflow.transitioned` are emitted only after commit; a failed
   * transition emits nothing (W4-E1-S4 AC).
   */
  async execute(actor: ActorContext, subject: WorkflowSubject, actionKey: string, opts: ExecuteOptions = {}) {
    const { moved, effects } = await (async () => {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: number; current_state_key: string; definition_id: number }>
        >`SELECT id, current_state_key, definition_id FROM workflow_instances
          WHERE subject_type = ${subject.subjectType} AND subject_id = ${subject.subjectId} FOR UPDATE`;
        if (locked.length === 0) {
          throw new NotFoundException(`No workflow instance for ${subject.subjectType} #${subject.subjectId}`);
        }
        const { id: instanceId, current_state_key: fromState, definition_id: definitionId } = locked[0];

        const transition = await tx.workflowTransition.findUnique({
          where: {
            definitionId_fromStateKey_actionKey: {
              definitionId,
              fromStateKey: fromState,
              actionKey,
            },
          },
        });
        if (!transition) {
          throw new BadRequestException(`Cannot "${actionKey}" from "${fromState}"`);
        }

        // guards re-checked atomically inside the lock
        for (const guard of (transition.guards as GuardRef[]) ?? []) {
          const verdict = await this.guards.evaluate(guard, actor, subject, tx);
          if (!verdict.pass) {
            throw new ForbiddenException(`Transition "${actionKey}" blocked: ${verdict.reason}`);
          }
        }

        await tx.workflowInstance.update({
          where: { id: instanceId },
          data: { currentStateKey: transition.toStateKey },
        });
        await tx.workflowStepLog.create({
          data: {
            instanceId,
            fromStateKey: fromState,
            toStateKey: transition.toStateKey,
            actionKey,
            actorUserId: actor.userId,
            note: opts.note,
            payload: (opts.payload ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });

        // compatibility bridge: legacy enum columns stay in lockstep
        if (opts.sync) await opts.sync(tx);

        return {
          instanceId,
          fromState,
          toState: transition.toStateKey,
          actionKey,
          effectNames: ((transition.effects as string[]) ?? []).filter(
            (e) => !opts.suppressEffects?.includes(e),
          ),
        };
      });
      return { moved: result, effects: result.effectNames };
    })();

    // Post-commit: effects are AWAITED in declaration order so their
    // side-effects (e.g. round creation) complete before the caller proceeds —
    // the same ordering the legacy synchronous service calls produced.
    // A failed transition threw above and emitted nothing (W4-E1-S4 AC).
    for (const effect of effects) {
      await this.eventBus.publishAndWait({
        event: effect,
        actor,
        subject: { type: subject.subjectType, id: subject.subjectId },
        data: { action: actionKey, fromState: moved.fromState, toState: moved.toState, ...(opts.payload ?? {}) },
      });
    }
    this.eventBus.publish({
      event: 'workflow.transitioned',
      actor,
      subject: { type: subject.subjectType, id: subject.subjectId },
      data: { instanceId: moved.instanceId, action: moved.actionKey, fromState: moved.fromState, toState: moved.toState },
    });

    return { instanceId: moved.instanceId, fromState: moved.fromState, toState: moved.toState, actionKey: moved.actionKey };
  }

  /**
   * Bridge resilience: subjects that predate the engine (or missed backfill)
   * get an instance positioned at the given state before their first engine
   * transition. Positioned starts are logged as 'position' steps.
   */
  async ensurePositionedInstance(subject: WorkflowSubject, stateKey: string, definitionKey = 'project-lifecycle') {
    const existing = await this.instanceFor(subject);
    if (existing) return existing;
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { key: definitionKey, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!definition) throw new NotFoundException(`No active workflow definition "${definitionKey}"`);
    const instance = await this.prisma.workflowInstance.create({
      data: {
        definitionId: definition.id,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        currentStateKey: stateKey,
      },
    });
    await this.prisma.workflowStepLog.create({
      data: { instanceId: instance.id, fromStateKey: null, toStateKey: stateKey, actionKey: 'position' },
    });
    return instance;
  }

  /** Instance detail for the admin UI: state, log, definition. */
  async instanceDetail(subject: WorkflowSubject) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: subject.subjectType, subjectId: subject.subjectId } },
      include: {
        definition: { select: { id: true, key: true, version: true } },
        stepLogs: { orderBy: { id: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException(`No workflow instance for ${subject.subjectType} #${subject.subjectId}`);
    return instance;
  }

  listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
      include: { _count: { select: { instances: true } } },
    });
  }

  async definitionDetail(id: number) {
    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { id },
      include: {
        states: { orderBy: { id: 'asc' } },
        transitions: { orderBy: { id: 'asc' } },
        _count: { select: { instances: true } },
      },
    });
    if (!definition) throw new NotFoundException(`Workflow definition #${id} not found`);
    return definition;
  }
}
