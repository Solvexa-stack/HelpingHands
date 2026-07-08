// Minimal on purpose: the only enforced rule is the W0-E2-S5 ActorContext
// convention (loaded via --rulesdir in the lint script). Broader lint rules
// are a separate decision, not part of the regression contract.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  // Registered (with no rules enabled) so existing eslint-disable comments
  // that reference @typescript-eslint/* rules resolve.
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'require-actor-context': 'error',
  },
};
