/**
 * M10-AC1 (F2-R1, NFR-03 v3.1): cold load of #/today on the cloud-off build (`--mode e2e`) stays
 * within the 230 kB working budget, and none of the transferred chunks is Recharts, the Supabase
 * SDK or the zod schema chunk (ADR-27). Measured exactly like tests/qc/final-nfr.spec.ts.
 */
import { expect, test } from '@playwright/test';
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
});
