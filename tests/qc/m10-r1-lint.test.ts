// QC M10 round 1 - M10-AC2 / M10-AC6(1): the lint boundaries really bite. Uses the ESLint Node API with the
// repository config (same as `npm run lint`) on virtual files, so nothing is written to src/.
import { ESLint } from 'eslint';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
async function errorsFor(code: string, filePath: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`);
}

const ZOD = "import { z } from 'zod';\nexport const s = z.string();\n";
const LAYERS = ['domain', 'config', 'services', 'data', 'app', 'i18n', 'integration', 'ui', 'ui/screens', 'ui/components'];

describe('zod containment (ADR-27)', () => {
  for (const layer of LAYERS) {
    const ext = layer.startsWith('ui') ? 'tsx' : 'ts';
    it(`import { z } from 'zod' in src/${layer}/probe.${ext} is an error`, async () => {
      const errs = await errorsFor(ZOD, `src/${layer}/probe.${ext}`);
      expect(errs.some((e) => e.startsWith('no-restricted-imports'))).toBe(true);
    });
  }
  it('is allowed in src/integration/supabase/probe.ts and in src/domain/backup.ts', async () => {
    expect(await errorsFor(ZOD, 'src/integration/supabase/probe.ts')).toEqual([]);
    expect(await errorsFor(ZOD, 'src/domain/backup.ts')).toEqual([]);
  });
  for (const [label, code] of [
    ['subpath zod/v4', "import { z } from 'zod/v4';\nexport const s = z;\n"],
    ['type-only import', "import type { z } from 'zod';\nexport type S = typeof z;\n"],
    ['re-export', "export { z } from 'zod';\n"],
    ['side-effect import', "import 'zod';\n"],
    ['namespace import', "import * as zod from 'zod';\nexport default zod;\n"],
  ] as const) {
    it(`${label} in src/ui/screens/probe.tsx is an error`, async () => {
      expect((await errorsFor(code, 'src/ui/screens/probe.tsx')).length).toBeGreaterThan(0);
    });
    it(`${label} in a src test file is an error`, async () => {
      expect((await errorsFor(code, 'src/services/probe.test.ts')).length).toBeGreaterThan(0);
    });
  }
});

describe('static import of domain/backup (ADR-27)', () => {
  const VALUE = (rel: string) => `import { parseBackup } from '${rel}';\nexport const f = parseBackup;\n`;
  it('services, ui screens, ui components, app, data, i18n: error', async () => {
    expect((await errorsFor(VALUE('../domain/backup'), 'src/services/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('../../domain/backup'), 'src/ui/screens/probe.tsx')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('../../domain/backup'), 'src/ui/components/probe.tsx')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('../domain/backup'), 'src/app/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('../domain/backup'), 'src/data/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('../domain/backup'), 'src/i18n/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor(VALUE('./backup'), 'src/domain/probe.ts')).length).toBeGreaterThan(0);
  });
  it('with an explicit extension and as a re-export: error', async () => {
    expect((await errorsFor(VALUE('../domain/backup.ts'), 'src/services/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor("export { parseBackup } from '../domain/backup';\n", 'src/services/probe.ts')).length).toBeGreaterThan(0);
  });
  it('import type is allowed; backup-file is allowed', async () => {
    expect(await errorsFor("import type { BackupFile } from '../domain/backup';\nexport type X = BackupFile;\n", 'src/services/probe.ts')).toEqual([]);
    expect(await errorsFor("import { backupReminder } from '../domain/backup-file';\nexport const r = backupReminder;\n", 'src/services/probe.ts')).toEqual([]);
  });
  it('the lazy dynamic import() of domain/backup is not blocked (that is how BackupService loads it)', async () => {
    expect(await errorsFor("export const load = () => import('../domain/backup');\n", 'src/services/probe.ts')).toEqual([]);
  });
});

describe('dynamic import of the Supabase SDK (M6-P1b)', () => {
  const SDK = "export const f = () => import('@supabase/supabase-js');\n";
  const CLIENT = (rel: string) => `export const g = () => import('${rel}');\n`;
  for (const layer of ['ui', 'services', 'app', 'domain', 'data', 'config', 'i18n', 'integration']) {
    const ext = layer === 'ui' ? 'tsx' : 'ts';
    it(`import('@supabase/supabase-js') in src/${layer}/probe.${ext} is an error`, async () => {
      expect((await errorsFor(SDK, `src/${layer}/probe.${ext}`)).length).toBeGreaterThan(0);
    });
  }
  it('import(supabase-client) outside integration/supabase is an error; inside it is allowed', async () => {
    expect((await errorsFor(CLIENT('../integration/supabase/supabase-client'), 'src/app/probe.ts')).length).toBeGreaterThan(0);
    expect((await errorsFor(CLIENT('../integration/supabase/supabase-client.ts'), 'src/ui/probe.tsx')).length).toBeGreaterThan(0);
    expect((await errorsFor(CLIENT('./supabase/supabase-client'), 'src/integration/probe.ts')).length).toBeGreaterThan(0);
    expect(await errorsFor(CLIENT('./supabase-client'), 'src/integration/supabase/probe.ts')).toEqual([]);
    expect(await errorsFor(SDK, 'src/integration/supabase/probe.ts')).toEqual([]);
  });
  it('static import of the SDK outside integration/supabase is an error', async () => {
    expect((await errorsFor("import { createClient } from '@supabase/supabase-js';\nexport const c = createClient;\n", 'src/ui/screens/probe.tsx')).length).toBeGreaterThan(0);
  });
  it('M1-AC12/AC17 probes still bite: hardcoded JSX text and dangerouslySetInnerHTML', async () => {
    expect((await errorsFor("export const A = () => <button>Save</button>;\n", 'src/ui/screens/probe.tsx')).length).toBeGreaterThan(0);
    expect((await errorsFor("export const B = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n", 'src/ui/screens/probe.tsx')).length).toBeGreaterThan(0);
  });
});

describe('only the allowed files import zod in production code (M10-AC2 rg check)', () => {
  it('every non-test src file that imports from zod is src/domain/backup.ts or under src/integration/supabase/', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && /from ['"]zod(\/[^'"]*)?['"]/.test(readFileSync(full, 'utf8'))) found.push(full.split(sep).join('/').replace(/^.*?\/src\//, 'src/'));
      }
    };
    walk(join(process.cwd(), 'src'));
    found.sort();
    for (const f of found) expect(f === 'src/domain/backup.ts' || f.startsWith('src/integration/supabase/'), f).toBe(true);
    expect(found).toContain('src/domain/backup.ts');
  });
});
