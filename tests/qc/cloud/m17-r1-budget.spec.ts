// QC M17 r1: exact cold-load bytes (gzip 9) of #/today, cloud on / signed out. Hard limit 230 000.
import { expect, test } from '../../../e2e/cloud/fixtures';
import { CLOUD_BASE_URL } from '../../../playwright.config';
import { measureColdToday } from '../../../e2e/helpers/bundle';

test('M17 budget (cloud on): exact bytes', async ({ page, mock }) => {
  await mock.reset();
  const load = await measureColdToday(page, CLOUD_BASE_URL);
  for (const h of load.hits) console.log(`BUDGET-EXACT cloud ${h.url} ${h.gzip}`);
  console.log(`BUDGET-EXACT cloud TOTAL ${load.total} responses ${load.hits.length}`);
  expect(load.total).toBeLessThanOrEqual(230_000);
  expect(load.hits.filter((h) => /roadmap/i.test(h.url))).toEqual([]);
});
