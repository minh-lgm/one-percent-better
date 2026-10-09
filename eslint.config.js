// ESLint flat config. Enforces the layer rules of ARCHITECTURE.md §3 with
// `no-restricted-imports` and the "no hardcoded UI text" rules (NFR-11) with
// `no-restricted-syntax`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx'];

/** Build a `no-restricted-imports` rule from regex patterns. */
const restrictImports = (entries) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: entries.map(([regex, message]) => ({ regex, message })),
    },
  ],
});

// Package-name regexes (match `pkg` and `pkg/sub`).
const pkg = (names) => `^(${names.join('|')})(/|$)`;
// Relative/absolute path regexes (match any path segment named like this).
const dir = (names) => `(^|/)(${names.join('|')})(/|$)`;

const HARDCODED_TEXT_SELECTORS = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is forbidden (NFR-05).',
  },
  {
    selector: 'JSXText[value=/[A-Za-z]/]',
    message: 'Hardcoded UI text: use t().',
  },
  {
    selector:
      "JSXAttribute[name.name=/^(aria-label|aria-description|aria-valuetext|placeholder|title|alt|label)$/][value.type='Literal']",
    message: 'Hardcoded accessible text: use t().',
  },
  {
    selector: 'JSXElement > JSXExpressionContainer > Literal[value=/[A-Za-z]/]',
    message: 'Hardcoded UI text in expression: use t().',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ---- Layer rules (ARCHITECTURE §3) ----
  {
    // Domain: pure. No React, no Dexie, no i18n, no other app layers.
    // (Domain *tests* may read the translation resources to check real copy.)
    files: ['src/domain/**/*.ts'],
    ignores: TEST_FILES,
    rules: restrictImports([
      [pkg(['react', 'react-dom', 'dexie', 'recharts', 'i18next', 'react-i18next']), 'Domain must stay pure (ARCH §3).'],
      [dir(['data', 'services', 'integration', 'ui', 'app', 'i18n']), 'Domain must not import other app layers (ARCH §3).'],
    ]),
  },
  {
    // Services: only repository interfaces, domain, i18n types/detect/format. Integrations injected.
    files: ['src/services/**/*.ts'],
    ignores: TEST_FILES,
    rules: restrictImports([
      [pkg(['dexie', 'react', 'react-dom', 'i18next', 'react-i18next']), 'Services must not depend on Dexie/React/i18next (ARCH §3).'],
      [dir(['dexie']), 'Services use repository interfaces, not the Dexie implementation (ARCH §3).'],
      [dir(['ui', 'app']), 'Services must not import UI (ARCH §3).'],
      ['(^|/)i18n/(instance|resources)(/|$|\\.)', 'Services receive a Translator; do not import the i18n instance/resources (ARCH §3).'],
    ]),
  },
  {
    // UI: no Dexie, no direct i18next (use hooks).
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    ignores: TEST_FILES,
    rules: restrictImports([
      [pkg(['dexie', 'i18next']), 'UI must not import Dexie or i18next directly (ARCH §3).'],
      [dir(['dexie']), 'UI must not import the Dexie implementation (ARCH §3).'],
    ]),
  },
  {
    // i18n: no React, no other layers.
    files: ['src/i18n/**/*.ts'],
    rules: restrictImports([
      [pkg(['react', 'react-dom', 'react-i18next']), 'i18n must not import React (ARCH §3).'],
      [dir(['ui', 'services', 'data', 'app', 'integration']), 'i18n must not import other app layers (ARCH §3).'],
    ]),
  },

  // ---- Hardcoded UI text + dangerouslySetInnerHTML (NFR-05, NFR-11) ----
  {
    files: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-syntax': ['error', ...HARDCODED_TEXT_SELECTORS],
    },
  },
  {
    files: ['**/*.tsx'],
    ignores: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', HARDCODED_TEXT_SELECTORS[0]],
    },
  },
);
