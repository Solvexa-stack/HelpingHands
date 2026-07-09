'use strict';

/**
 * W5-E2-S1 — the treasury module is the SOLE writer of ledger tables
 * (02 module rule; DB grants land in Wave 8). Any `account` /
 * `ledgerTransaction` / `ledgerEntry` write outside the allowlist is a
 * boundary violation.
 */
const ALLOWLIST = [/[/\\]treasury[/\\]/, /backfills[/\\]/, /\.spec\.ts$/];
const LEDGER_MODELS = new Set(['account', 'ledgerTransaction', 'ledgerEntry']);
const WRITE_METHODS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Only the treasury module writes ledger tables (W5-E2-S1)' },
    schema: [],
    messages: {
      boundary:
        'Direct {{call}} violates the treasury boundary — post through TreasuryService (or add the file to the allowlist for backfill/system paths).',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (ALLOWLIST.some((re) => re.test(filename)) || !/[/\\]src[/\\]/.test(filename)) return {};
    return {
      MemberExpression(node) {
        if (
          node.property.type === 'Identifier' &&
          WRITE_METHODS.has(node.property.name) &&
          node.object.type === 'MemberExpression' &&
          node.object.property.type === 'Identifier' &&
          LEDGER_MODELS.has(node.object.property.name)
        ) {
          context.report({
            node,
            messageId: 'boundary',
            data: { call: `${node.object.property.name}.${node.property.name}` },
          });
        }
      },
    };
  },
};
