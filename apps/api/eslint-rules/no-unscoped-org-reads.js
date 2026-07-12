'use strict';

/**
 * W2-E3-S3 — list-shaped reads of org-owned aggregates must go through
 * TenancyRepository. Direct `*.project.findMany/count` calls are forbidden
 * outside the allowlist (the repository itself, the projects service that
 * routes through it, and system/audit paths).
 */
const ALLOWLIST = [
  /tenancy\.repository\.ts$/,
  /projects\.service\.ts$/, // routes list reads through enforcedProjectWhere
  /fk-consistency\.service\.ts$/,
  /transparency-read\.service\.ts$/, // @Public() platform-wide aggregates — scoping would hide totals from visitors
  /\.spec\.ts$/,
];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Forbid unscoped list reads of org-owned aggregates (W2-E3-S3)' },
    schema: [],
    messages: {
      unscoped:
        'Direct {{call}} bypasses tenancy scoping — use TenancyRepository (or add the file to the allowlist for system paths).',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (ALLOWLIST.some((re) => re.test(filename)) || !/[/\\]src[/\\]/.test(filename)) return {};
    return {
      MemberExpression(node) {
        if (
          node.property.type === 'Identifier' &&
          ['findMany', 'count'].includes(node.property.name) &&
          node.object.type === 'MemberExpression' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'project'
        ) {
          context.report({
            node,
            messageId: 'unscoped',
            data: { call: `prisma.project.${node.property.name}` },
          });
        }
      },
    };
  },
};
