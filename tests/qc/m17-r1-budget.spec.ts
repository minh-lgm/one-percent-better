// QC M17 r1: exact cold-load bytes (gzip 9) of #/today, cloud off. Prints per-response numbers; hard limit 230 000.
import { expect, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import { measureColdToday } from '../../e2e/helpers/bundle';

test('M17 budget (cloud off): exact bytes', async ({ page }) => {
  const load = await measureColdToday(page, BASE_URL);
  for (const h of load.hits) console.log(`BUDGET-EXACT chromium ${h.url} ${h.gzip}`);
  console.log(`BUDGET-EXACT chromium TOTAL ${load.total} responses ${load.hits.length}`);
  expect(load.total).toBeLessThanOrEqual(230_000);
  expect(load.hits.filter((h) => /roadmap/i.test(h.url))).toEqual([]);
});
