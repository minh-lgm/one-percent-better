// M12-AC10: the ADR-35 lint boundaries really bite. Uses the ESLint Node API with the repository config (same
// as `npm run lint`) on virtual files, so nothing is written to src/.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
async function errorsFor(code: string, filePath: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`);
}

const CAPACITOR = "import { Capacitor } from '@capacitor/core'; export const c = Capacitor;\n";
const CAPGO = "import { SocialLogin } from '@capgo/capacitor-social-login'; export const c = SocialLogin;\n";

describe('@capacitor/* and @capgo/* only in src/integration/native/** (ADR-35)', () => {
  for (const f of ['src/services/probe.ts', 'src/ui/probe.tsx', 'src/app/probe.ts', 'src/domain/probe.ts', 'src/data/probe.ts', 'src/integration/probe.ts', 'src/i18n/probe.ts', 'e2e/probe.ts', 'tests/qc/probe.test.ts', 'src/services/probe.test.ts']) {
    it(`${f}: error`, async () => {
      const errs = await errorsFor(CAPACITOR, f);
      expect(errs.some((e) => e.startsWith('no-restricted-imports') && e.includes('@capacitor')), errs.join('\n')).toBe(true);
      expect((await errorsFor(CAPGO, f)).some((e) => e.startsWith('no-restricted-imports'))).toBe(true);
    });
  }
  it('src/integration/native/probe.ts and its test: allowed', async () => {
    expect(await errorsFor(CAPACITOR, 'src/integration/native/probe.ts')).toEqual([]);
    expect(await errorsFor(CAPACITOR, 'src/integration/native/probe.test.ts')).toEqual([]);
    expect(await errorsFor("import { Filesystem } from '@capacitor/filesystem'; export const f = Filesystem;\n", 'src/integration/native/file-export.ts')).toEqual([]);
  });
  it('the native folder still keeps the other boundaries (zod, Supabase SDK)', async () => {
    expect((await errorsFor("import { z } from 'zod'; export const s = z;\n", 'src/integration/native/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor("import { createClient } from '@supabase/supabase-js'; export const s = createClient;\n", 'src/integration/native/probe.ts')).length).toBeGreaterThan(0);
  });
});

describe('import() into integration/native only from src/integration/platform.ts (ADR-35)', () => {
  const DYN = (rel: string) => `export const m = () => import('${rel}');\n`;
  for (const [f, rel] of [
    ['src/ui/probe.tsx', '../integration/native/index'],
    ['src/app/probe.ts', '../integration/native/index'],
    ['src/services/probe.ts', '../integration/native/index'],
    ['src/integration/probe.ts', './native/index'],
    ['src/integration/supabase/loader.ts', '../native/index'],
  ] as const) {
    it(`${f}: error`, async () => {
      const errs = await errorsFor(DYN(rel), f);
      expect(errs.some((e) => e.startsWith('no-restricted-syntax') && e.includes('integration/native')), errs.join('\n')).toBe(true);
    });
  }
  it('src/integration/platform.ts (probe in the same place): allowed', async () => {
    expect(await errorsFor(DYN('./native/index'), 'src/integration/platform.ts')).toEqual([]);
  });
  it('platform.ts still cannot import() the Supabase SDK', async () => {
    expect((await errorsFor("export const m = () => import('@supabase/supabase-js');\n", 'src/integration/platform.ts')).length).toBeGreaterThan(0);
  });
});

describe('src/ui/** imports no integration values (ARCH §3 v5.0)', () => {
  it('value import of integration/file-io from a screen: error; `import type` is fine', async () => {
    const errs = await errorsFor("import { downloadTextFile } from '../../integration/file-io'; export const d = downloadTextFile;\n", 'src/ui/screens/probe.tsx');
    expect(errs.some((e) => e.startsWith('no-restricted-imports') && e.includes('integration'))).toBe(true);
    expect(await errorsFor("import type { PersistState } from '../../integration/storage'; export type P = PersistState;\n", 'src/ui/screens/probe.tsx')).toEqual([]);
  });
});

describe('older probes still hold (M1-AC13, M1-AC17, M6-AC4)', () => {
  it('domain → react, ui → dexie, services → @supabase, hardcoded JSX text', async () => {
    expect((await errorsFor("import React from 'react'; export const r = React;\n", 'src/domain/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor("import Dexie from 'dexie'; export const d = Dexie;\n", 'src/ui/probe.tsx')).length).toBeGreaterThan(0);
    expect((await errorsFor("import { createClient } from '@supabase/supabase-js'; export const c = createClient;\n", 'src/services/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor('export const X = () => <p>Hello</p>;\n', 'src/ui/probe.tsx')).length).toBeGreaterThan(0);
  });
});
