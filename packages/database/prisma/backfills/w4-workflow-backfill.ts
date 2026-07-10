import { PrismaClient } from '@prisma/client';

/**
 * W4-E3 — workflow instance backfill (idempotent, re-runnable).
 *
 * S1 census: every live combination of `studyStatus × isCompleted` must have
 * an explicit mapping in DERIVATION below — an unmapped combination fails the
 * run (nothing is guessed).
 *
 * S2 backfill: every project gets a `project-lifecycle` v1 instance positioned
 * by the derivation rule; verification maps each instance's currentState back
 * to the legacy columns and fails on any mismatch.
 *
 * Derivation table (agreed with the wave doc; ambiguities resolved):
 *   isCompleted=true                → completed   (funding goal reached)
 *   studyStatus null (no study)     → donations_open (legacy projects accept
 *                                     donations without a study today)
 *   studyStatus approved            → donations_open (donations continue after
 *                                     approval; 'approved' is transient)
 *   studyStatus rejected            → rejected
 *   any other studyStatus S         → S (same-named state)
 */

const REQUEST_ID = 'w4-backfill';

export function deriveStateFromLegacy(studyStatus: string | null, isCompleted: boolean): string {
  if (isCompleted) return 'completed';
  if (studyStatus === null) return 'donations_open';
  if (studyStatus === 'approved') return 'donations_open';
  const known = ['draft', 'in_review', 'published', 'voting_open', 'voting_closed', 'rejected'];
  if (known.includes(studyStatus)) return studyStatus;
  throw new Error(`W4 census: unmapped legacy combination studyStatus=${studyStatus} isCompleted=${isCompleted}`);
}

export interface WorkflowBackfillResult {
  census: Array<{ studyStatus: string | null; isCompleted: boolean; count: number; state: string }>;
  instancesCreated: number;
  verification: { projectsChecked: number; mismatches: string[] };
}

export async function backfillWorkflowInstances(prisma: PrismaClient): Promise<WorkflowBackfillResult> {
  // Pinned to v1 explicitly: projects that predate the engine were governed
  // by the legacy machine v1 transcribes. v2 (W6) applies only to NEW
  // projects of oversight-flagged orgs — never retroactively (engine
  // versioning rule, 04).
  const definition = await prisma.workflowDefinition.findFirst({
    where: { key: 'project-lifecycle', version: 1, isActive: true },
  });
  if (!definition) throw new Error('W4 backfill: active project-lifecycle definition missing — seed definitions first');

  // ── S1: census — every live combination must derive without throwing ──
  const combos = await prisma.project.groupBy({
    by: ['studyStatus', 'isCompleted'],
    _count: { id: true },
  });
  const census = combos.map((c) => ({
    studyStatus: c.studyStatus as string | null,
    isCompleted: c.isCompleted,
    count: c._count.id,
    state: deriveStateFromLegacy(c.studyStatus as string | null, c.isCompleted),
  }));

  // ── S2: positioned instances for every project (idempotent) ──
  let instancesCreated = 0;
  const createdProjectIds: number[] = [];
  const projects = await prisma.project.findMany({
    select: { id: true, studyStatus: true, isCompleted: true },
    orderBy: { id: 'asc' },
  });
  for (const project of projects) {
    const existing = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: project.id } },
    });
    if (existing) continue;
    const state = deriveStateFromLegacy(project.studyStatus as string | null, project.isCompleted);
    const instance = await prisma.workflowInstance.create({
      data: {
        definitionId: definition.id,
        subjectType: 'project',
        subjectId: project.id,
        currentStateKey: state,
      },
    });
    await prisma.workflowStepLog.create({
      data: {
        instanceId: instance.id,
        fromStateKey: null,
        toStateKey: state,
        actionKey: 'backfill',
        note: `${REQUEST_ID}: derived from studyStatus=${project.studyStatus ?? 'null'} isCompleted=${project.isCompleted}`,
      },
    });
    instancesCreated += 1;
    createdProjectIds.push(project.id);
  }

  // Verification covers what THIS run positioned — divergence on projects with
  // pre-existing instances is live-data drift, owned by the nightly
  // WorkflowParityService, not by an idempotent re-run of the backfill.
  return { census, instancesCreated, verification: await verifyWorkflowBackfill(prisma, createdProjectIds) };
}

/** Every instance's currentState must map back to its legacy columns exactly. */
export async function verifyWorkflowBackfill(
  prisma: PrismaClient,
  onlyProjectIds?: number[],
): Promise<{ projectsChecked: number; mismatches: string[] }> {
  const mismatches: string[] = [];
  const projects = await prisma.project.findMany({
    select: { id: true, studyStatus: true, isCompleted: true },
    where: onlyProjectIds ? { id: { in: onlyProjectIds } } : undefined,
  });
  for (const project of projects) {
    const instance = await prisma.workflowInstance.findUnique({
      where: { subjectType_subjectId: { subjectType: 'project', subjectId: project.id } },
    });
    if (!instance) {
      mismatches.push(`project ${project.id}: no workflow instance`);
      continue;
    }
    const expected = deriveStateFromLegacy(project.studyStatus as string | null, project.isCompleted);
    // 'executing' is entered by live transitions after backfill and also maps
    // to the donations_open legacy shape — both directions accepted.
    const compatible =
      instance.currentStateKey === expected ||
      (expected === 'donations_open' && instance.currentStateKey === 'executing') ||
      (expected === 'donations_open' && instance.currentStateKey === 'approved');
    if (!compatible) {
      mismatches.push(
        `project ${project.id}: instance=${instance.currentStateKey} but legacy derives ${expected}`,
      );
    }
  }
  return { projectsChecked: projects.length, mismatches };
}
