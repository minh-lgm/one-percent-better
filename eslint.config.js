// ESLint flat config. Enforces the layer rules of ARCHITECTURE.md §3 with
// `no-restricted-imports` and the "no hardcoded UI text" rules (NFR-11) with
// `no-restricted-syntax`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx'];

/** Build a `no-restricted-imports` rule from regex patterns (`[regex, message, extra?]`). */
const restrictImports = (entries) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: entries.map(([regex, message, extra]) => ({ regex, message, ...(extra ?? {}) })),
    },
  ],
});

// Package-name regexes (match `pkg` and `pkg/sub`).
const pkg = (names) => `^(${names.join('|')})(/|$)`;
// Relative/absolute path regexes (match any path segment named like this).
const dir = (names) => `(^|/)(${names.join('|')})(/|$)`;

// ARCHITECTURE §3 (v2.0): the Supabase SDK is imported statically only in src/integration/supabase/**,
// and `supabase-client` is only reached through the dynamic `import()` in loader.ts (ADR-18).
const SUPABASE_RULES = [
  [pkg(['@supabase']), '@supabase/* may only be imported in src/integration/supabase/** (ARCH §3, ADR-18).'],
  ['(^|/)supabase-client(\\.[cm]?[jt]sx?)?$', 'Do not import supabase-client statically: use integration/supabase/loader (ADR-18, keeps the SDK out of the entry chunk).'],
];

// ARCHITECTURE §3 (v3.1, ADR-27): zod stays on the two lazy boundaries only; everything else validates in plain TS.
const ZOD_RULE = [pkg(['zod']), 'zod is only allowed in src/domain/backup.ts and src/integration/supabase/** (ADR-27: keep it off the cold-load path).'];
// ADR-27: `domain/backup.ts` (the zod schema) is reached only through the `import()` in BackupService.parse;
// a static value import anywhere in the app would drag zod into the entry chunk. `import type` is fine.
const BACKUP_STATIC_RULE = [
  '(^|/)backup(\\.[cm]?[jt]sx?)?$',
  'Do not import domain/backup statically: use domain/backup-file (types/constants) or BackupService.parse (ADR-27).',
  { allowTypeImports: true },
];
const BOUNDARY_RULES = [ZOD_RULE, ...SUPABASE_RULES];

const DOMAIN_RULES = [
  [pkg(['react', 'react-dom', 'dexie', 'recharts', 'i18next', 'react-i18next']), 'Domain must stay pure (ARCH §3).'],
  [dir(['data', 'services', 'integration', 'ui', 'app', 'i18n']), 'Domain must not import other app layers (ARCH §3).'],
];

// M6-P1: `import('@supabase/…')` / `import('…/supabase-client')` must not appear outside the integration folder either.
const DYNAMIC_SUPABASE_SELECTORS = [
  {
    selector: "ImportExpression > Literal[value=/^@supabase/]",
    message: 'Dynamic import of @supabase/* is only allowed in src/integration/supabase/** (ADR-18).',
  },
  {
    selector: "ImportExpression > Literal[value=/supabase-client([.][cm]?[jt]sx?)?$/]",
    message: 'Dynamic import of supabase-client is only allowed in src/integration/supabase/loader.ts (ADR-18).',
  },
];

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
      // `alt=""` (decorative image) carries no text and is allowed.
      "JSXAttribute[name.name=/^(aria-label|aria-description|aria-valuetext|placeholder|title|alt|label)$/][value.type='Literal'][value.value!='']",
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
      'dist-cloud-e2e/**',
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

  // ---- Supabase SDK containment (ARCH §3 v2.0, ADR-18): applies to every file, including tests;
  // the layer configs below restate these rules because flat-config rule options do not merge. ----
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'e2e/**/*.ts', 'tests/**/*.ts', 'tests/**/*.tsx'],
    ignores: ['src/integration/supabase/**', 'tests/db/**'],
    rules: restrictImports(SUPABASE_RULES),
  },
  {
    // zod containment (ADR-27): every app file except the two lazy boundaries (tests included, so a
    // test cannot smuggle zod into a helper that production code imports).
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/integration/supabase/**', 'src/domain/backup.ts'],
    rules: restrictImports(BOUNDARY_RULES),
  },
  {
    // Static `domain/backup` containment (ADR-27): app layers use `domain/backup-file`; tests may import the schema directly.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [...TEST_FILES, 'src/domain/backup.ts', 'src/integration/supabase/**'],
    rules: restrictImports([...BOUNDARY_RULES, BACKUP_STATIC_RULE]),
  },
  {
    // Non-JSX files: only the dynamic-import rule (the .tsx configs below restate it next to the text rules).
    files: ['src/**/*.ts', 'e2e/**/*.ts', 'tests/**/*.ts'],
    ignores: ['src/integration/supabase/**', 'tests/db/**'],
    rules: { 'no-restricted-syntax': ['error', ...DYNAMIC_SUPABASE_SELECTORS] },
  },

  // ---- Layer rules (ARCHITECTURE §3) ----
  {
    // Domain: pure. No React, no Dexie, no i18n, no other app layers.
    // (Domain *tests* may read the translation resources to check real copy.)
    files: ['src/domain/**/*.ts'],
    ignores: [...TEST_FILES, 'src/domain/backup.ts'],
    rules: restrictImports([...DOMAIN_RULES, ...BOUNDARY_RULES, BACKUP_STATIC_RULE]),
  },
  {
    // The zod boundary of the domain: same purity rules, zod allowed (ADR-27).
    files: ['src/domain/backup.ts'],
    rules: restrictImports([...DOMAIN_RULES, ...SUPABASE_RULES]),
  },
  {
    // Services: only repository interfaces, domain, i18n types/detect/format. Integrations injected.
    files: ['src/services/**/*.ts'],
    ignores: TEST_FILES,
    rules: restrictImports([
      [pkg(['dexie', 'react', 'react-dom', 'i18next', 'react-i18next']), 'Services must not depend on Dexie/React/i18next (ARCH §3).'],
      [dir(['dexie']), 'Services use repository interfaces, not the Dexie implementation (ARCH §3).'],
      [dir(['ui', 'app']), 'Services must not import UI (ARCH §3).'],
      [dir(['integration']), 'Services receive integrations through the constructor/factory; do not import src/integration (ARCH §3).'],
      ['(^|/)i18n/(instance|resources)(/|$|\\.)', 'Services receive a Translator; do not import the i18n instance/resources (ARCH §3).'],
      ...BOUNDARY_RULES,
      BACKUP_STATIC_RULE,
    ]),
  },
  {
    // UI: no Dexie, no direct i18next (use hooks).
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    ignores: TEST_FILES,
    rules: restrictImports([
      [pkg(['dexie', 'i18next']), 'UI must not import Dexie or i18next directly (ARCH §3).'],
      [dir(['dexie']), 'UI must not import the Dexie implementation (ARCH §3).'],
      ...BOUNDARY_RULES,
      BACKUP_STATIC_RULE,
    ]),
  },
  {
    // i18n: no React, no other layers.
    files: ['src/i18n/**/*.ts'],
    rules: restrictImports([
      [pkg(['react', 'react-dom', 'react-i18next']), 'i18n must not import React (ARCH §3).'],
      [dir(['ui', 'services', 'data', 'app', 'integration']), 'i18n must not import other app layers (ARCH §3).'],
      ...BOUNDARY_RULES,
      BACKUP_STATIC_RULE,
    ]),
  },

  // ---- Hardcoded UI text + dangerouslySetInnerHTML (NFR-05, NFR-11) ----
  {
    files: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-syntax': ['error', ...HARDCODED_TEXT_SELECTORS, ...DYNAMIC_SUPABASE_SELECTORS],
    },
  },
  {
    files: ['**/*.tsx'],
    ignores: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', HARDCODED_TEXT_SELECTORS[0], ...DYNAMIC_SUPABASE_SELECTORS],
    },
  },
);
