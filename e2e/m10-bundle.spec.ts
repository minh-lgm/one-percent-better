/**
 * M10-AC1 (F2-R1, NFR-03 v3.1): cold load of #/today on the cloud-off build (`--mode e2e`) stays
 * within the 230 kB working budget, and none of the transferred chunks is Recharts, the Supabase
 * SDK or the zod schema chunk (ADR-27). Measured exactly like tests/qc/final-nfr.spec.ts.
 */
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URL } from '../playwright.config';
import { expectWithinBudget, logColdLoad, measureColdToday } from './helpers/bundle';

test('M10-AC1: cold #/today (cloud off) <= 230 kB gzip, no Recharts / SDK / zod chunk, no external request', async ({ page }) => {
  const load = await measureColdToday(page, BASE_URL);
  logColdLoad('budget chromium', load);
  expectWithinBudget(load);
  expect(load.external).toEqual([]);
  // Sanity: the entry chunk and the stylesheet were measured (the method really saw the app).
  expect(load.hits.some((h) => /^\/assets\/index-.*\.js$/.test(h.url))).toBe(true);
  expect(load.hits.some((h) => /\.css$/.test(h.url))).toBe(true);
  // v8.0 (M17-AC8, ADR-53): nothing of the big-goals feature on the cold-load path — no roadmap chunk, and the
  // transferred JS/CSS contains neither the `roadmap` namespace strings nor the QPT template content.
  expect(load.hits.filter((h) => /Roadmap|roadmap/.test(h.url))).toEqual([]);
  // v8.0 (M18, ARCH §10 "lazy sync"): the sync engine is not on the cold-load path either (and the cloud-off build has
  // no sync-engine chunk at all, see the next test).
  expect(load.hits.filter((h) => /sync-engine/.test(h.url))).toEqual([]);
  for (const h of load.hits.filter((x) => /javascript|css/.test(x.type))) {
    const body = readFileSync(join(process.cwd(), 'dist', h.url), 'utf8');
    for (const marker of ['Plans that run for weeks', 'Study time comes from the goal', 'Linear Algebra', 'Đúng tiến độ', 'Your roadmaps', 'rm-chip', 'Roadmap items, in order', 'rd-strip', 'Save details', 'How study time is counted',
      // M20: template content, D7, checkpoint table/chart
      'Weekly rhythm', 'Nhịp học mỗi tuần', 'Thi QPT chính thức', 'Official QPT exam', 'Create from QPT 21-week template', 'Scores vs. thresholds', 'cp-table', 'cp-hatch']) {
      expect(body.includes(marker), `${h.url} contains "${marker}"`).toBe(false);
    }
  }
});

test('M10-AC6 (3): the cloud-off build emits no supabase-client chunk and no JS mentions auth/v1; M18: no sync-engine chunk either', async () => {
  const dir = join(process.cwd(), 'dist', 'assets');
  const files = readdirSync(dir);
  expect(files.filter((f) => /^supabase-client-.*\.js$/.test(f))).toEqual([]);
  // M18 (ARCH §10): `__OPB_CLOUD__ = false` drops the `import()` of the sync engine, so the chunk is never emitted and
  // no JS of the cloud-off build contains the engine's lock name.
  expect(files.filter((f) => /^sync-engine-.*\.js$/.test(f))).toEqual([]);
  expect(files.filter((f) => f.endsWith('.js') && readFileSync(join(dir, f), 'utf8').includes('opb-sync'))).toEqual([]);
  const withAuthV1 = files.filter((f) => f.endsWith('.js') && readFileSync(join(dir, f), 'utf8').includes('auth/v1'));
  expect(withAuthV1).toEqual([]);
  const precache = readFileSync(join(process.cwd(), 'dist', 'sw.js'), 'utf8');
  expect(precache).not.toContain('supabase-client');
});
