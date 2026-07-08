'use strict';

/**
 * W0-E2-S5 — mutating service methods must take ActorContext as their first
 * parameter (threading convention, see src/events/README.md).
 *
 * Applies to public methods of `*.service.ts` files whose names start with a
 * mutating verb. Private/protected/static methods are exempt (they inherit
 * the actor from their public entry point). Legacy methods are grandfathered
 * with an eslint-disable comment naming this rule — remove the comment when
 * the method is threaded.
 */

const MUTATING_PREFIX =
  /^(create|update|delete|remove|change|cancel|approve|reject|assign|cast|toggle|upload|submit)([A-Z_]|$)/;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require ActorContext as the first parameter of mutating service methods (W0-E2-S5)',
    },
    schema: [],
    messages: {
      missingActor:
        "Mutating service method '{{name}}' must take ActorContext as its first parameter " +
        '(threading convention, apps/api/src/events/README.md).',
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!/\.service\.ts$/.test(filename) || /\.spec\.ts$/.test(filename)) {
      return {};
    }
    // The event infrastructure itself (bus, buffers) is not a domain service.
    if (/[/\\]src[/\\]events[/\\]/.test(filename)) {
      return {};
    }

    return {
      MethodDefinition(node) {
        if (node.kind !== 'method' || node.static) return;
        if (node.accessibility === 'private' || node.accessibility === 'protected') return;
        if (node.key.type !== 'Identifier' || !MUTATING_PREFIX.test(node.key.name)) return;

        const first = node.value.params[0];
        const annotation =
          first && first.typeAnnotation && first.typeAnnotation.typeAnnotation;
        const typeName =
          annotation &&
          annotation.type === 'TSTypeReference' &&
          annotation.typeName.type === 'Identifier'
            ? annotation.typeName.name
            : null;

        if (typeName !== 'ActorContext') {
          context.report({
            node: node.key,
            messageId: 'missingActor',
            data: { name: node.key.name },
          });
        }
      },
    };
  },
};
