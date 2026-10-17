// Cold-load budget measurement (TASKS Phase 4 "Cách đo ngân sách tải lạnh", ADR-27): the same method as
// tests/qc/final-nfr.spec.ts — every JS/CSS/HTML response of the app origin, gzip level 9, minus the
// service worker files. Shared by the `chromium` and `cloud` budget specs.
import { expect, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { freezeClock, gotoHash } from './app';

/** Working budget (PRD NFR-03 v3.1); the QC specs keep the hard 250 000 limit. */
export const COLD_LOAD_BUDGET_BYTES = 230_000;

export interface Hit {
  url: string;
  type: string;
  gzip: number;
  raw: number;
  /** JS bodies only: does the chunk contain zod (`ZodError`)? */
  zod: boolean;
}

export interface ColdLoad {
  hits: Hit[];
  total: number;
  external: string[];
}

/** Open `#/today` in a fresh page and collect every text asset it transferred. */
export async function measureColdToday(page: Page, baseUrl: string): Promise<ColdLoad> {
  const hits: Hit[] = [];
  const external: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseUrl)) external.push(r.url());
  });
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(baseUrl)) return;
    pending.push(
      (async () => {
        const type = res.headers()['content-type'] ?? '';
        if (!/javascript|css|html/.test(type)) return;
        const body = await res.body().catch(() => Buffer.alloc(0));
        hits.push({
          url: url.replace(baseUrl, '/').replace(/^\/\//, '/'),
          type,
          raw: body.length,
          gzip: gzipSync(body, { level: 9 }).length,
          zod: /javascript/.test(type) && body.includes('ZodError'),
        });
      })(),
    );
  });
  await freezeClock(page);
  await gotoHash(page, '/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const first = hits.filter((h) => !/^\/(sw|workbox)/.test(h.url));
  return { hits: first, total: first.reduce((s, h) => s + h.gzip, 0), external };
}

export function logColdLoad(tag: string, load: ColdLoad): void {
  for (const h of load.hits) console.log(`[${tag}] ${h.url}  ${(h.gzip / 1000).toFixed(1)} kB${h.zod ? '  (contains ZodError)' : ''}`);
  console.log(`[${tag}] total ${(load.total / 1000).toFixed(1)} kB gzip over ${load.hits.length} responses (budget ${COLD_LOAD_BUDGET_BYTES / 1000} kB)`);
}

/** The assertions of M10-AC1, shared by both projects. */
export function expectWithinBudget(load: ColdLoad): void {
  expect(load.total).toBeLessThanOrEqual(COLD_LOAD_BUDGET_BYTES);
  expect(load.hits.filter((h) => /useRechartsWidth|BarChart|CurveChart/.test(h.url))).toEqual([]);
  expect(load.hits.filter((h) => /supabase-client-/.test(h.url))).toEqual([]);
  expect(load.hits.filter((h) => h.zod).map((h) => h.url)).toEqual([]);
}
