// ESLint flat config: recommended rules, Node globals for the server and tests,
// browser globals for public/.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'coverage/', 'uploads/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  {
    // Runs in Node, but the functions it hands to Chrome run inside the page.
    files: ['scripts/browser-check.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
