import { Prisma } from '@prisma/client';

const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);

/** does the write's data payload touch the frozen enum column? */
function touches(data: unknown, column: string): boolean {
  if (data == null || typeof data !== 'object') return false;
  const rows = Array.isArray(data) ? data : [data];
  return rows.some((row) => row && typeof row === 'object' && column in (row as object));
}

/**
 * W6-E2-S1 — the legacy category enum columns are FROZEN after the reader
 * cutover: `Project.category` and `StudyDepartmentTemplate.projectType` are
 * historical data (dropped Wave 8). The truth is `categoryId` /
 * `categoryNodeId`; application code that still writes the enum columns is a
 * missed cutover — fail it loudly (same discipline as the W3 StudyVote and
 * W5 ProjectTransaction freezes).
 */
export function createCategoryEnumFreezeMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (WRITE_ACTIONS.has(params.action)) {
      const args = params.args as { data?: unknown; create?: unknown; update?: unknown } | undefined;
      const payloads = [args?.data, args?.create, args?.update];
      if (params.model === 'Project' && payloads.some((p) => touches(p, 'category'))) {
        throw new Error(
          `Project.category is frozen (W6-E2-S1): attempted "${params.action}" — write categoryId instead`,
        );
      }
      if (params.model === 'StudyDepartmentTemplate' && payloads.some((p) => touches(p, 'projectType'))) {
        throw new Error(
          `StudyDepartmentTemplate.projectType is frozen (W6-E2-S1): attempted "${params.action}" — write categoryNodeId instead`,
        );
      }
    }
    return next(params);
  };
}
