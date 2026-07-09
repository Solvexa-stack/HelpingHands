'use strict';

/**
 * W4-E4-S2 — migrated lifecycle columns may only be written through the
 * engine (or inside the sanctioned bridge/sync call sites). Direct
 * `projectStudy.update(...)` / `project.update({ studyStatus | isCompleted })`
 * writes outside the allowlist are the drift the nightly parity job exists to
 * catch — fail them at lint time instead.
 */
const ALLOWLIST = [
  /study\.service\.ts$/, // bridge sync callbacks + legacy (flag-off) path
  /governance\.service\.ts$/, // decideStudy legacy sync (new→old, 09)
  /voting\.service\.ts$/, // auto-close bridge
  /projects\.service\.ts$/, // recalculateProgress owns isCompleted
  /workflow[/\\]/, // the engine itself
  /backfills[/\\]/,
  /\.spec\.ts$/,
];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Forbid direct writes to engine-migrated lifecycle columns (W4-E4)' },
    schema: [],
    messages: {
      direct:
        'Direct {{call}} bypasses the workflow engine — route the transition through WorkflowService.execute() (or add the file to the allowlist for bridge/system paths).',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (ALLOWLIST.some((re) => re.test(filename)) || !/[/\\]src[/\\]/.test(filename)) return {};
    /** does the call's `data: {...}` argument set a `status` key? */
    function writesStatus(callNode) {
      const arg = callNode.arguments?.[0];
      if (!arg || arg.type !== 'ObjectExpression') return false;
      const dataProp = arg.properties.find(
        (p) => p.type === 'Property' && p.key && (p.key.name === 'data' || p.key.value === 'data'),
      );
      if (!dataProp || dataProp.value.type !== 'ObjectExpression') return false;
      return dataProp.value.properties.some(
        (p) => p.type === 'Property' && p.key && (p.key.name === 'status' || p.key.value === 'status'),
      );
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          ['update', 'updateMany'].includes(callee.property.name) &&
          callee.object.type === 'MemberExpression' &&
          callee.object.property.type === 'Identifier' &&
          ['projectStudy'].includes(callee.object.property.name) &&
          writesStatus(node)
        ) {
          context.report({
            node,
            messageId: 'direct',
            data: { call: `${callee.object.property.name}.${callee.property.name}` },
          });
        }
      },
    };
  },
};
