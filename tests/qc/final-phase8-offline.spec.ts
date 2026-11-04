// Final QC phase 8: the new lazy chunks are in the service worker precache, and #/roadmaps/rq opens after a reload while offline.
import { expect, test } from '@playwright/test';
import { FIXED_TIME_Q1, freezeClock, gotoHash, importBackup } from '../../e2e/helpers/app';

test('precache holds Roadmaps-*.js/css and roadmap.{en,vi}-*.js; offline reload of #/roadmaps/rq works', async ({ page, context }) => {
  await freezeClock(page, FIXED_TIME_Q1);
  await gotoHash(page, '/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // wait until the precache is filled
  await expect
    .poll(async () => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)))).flat().length), { timeout: 20_000 })
    .toBeGreaterThan(40);
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)))).flat());
  const names = urls.map((u) => u.split('/').pop()!.split('?')[0]);
  const has = (re: RegExp) => names.filter((n) => re.test(n));
  console.log('PRECACHE', JSON.stringify({ roadmaps: has(/^Roadmaps-/), ns: has(/^roadmap\.(en|vi)-/), syncEngine: has(/^sync-engine-/), total: names.length }));
  expect(has(/^Roadmaps-.*\.js$/)).toHaveLength(1);
  expect(has(/^Roadmaps-.*\.css$/)).toHaveLength(1);
  expect(has(/^roadmap\.en-/)).toHaveLength(1);
  expect(has(/^roadmap\.vi-/)).toHaveLength(1);
  // data via the real import, then offline reload straight on the roadmap detail
  await importBackup(page, 'q1-roadmap-backup.json');
  await gotoHash(page, '/roadmaps/rq');
  await expect(page.getByTestId('done-value')).toHaveText('1/21');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('done-value')).toHaveText('1/21');
  await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
  await gotoHash(page, '/roadmaps');
  await expect(page.getByTestId('roadmap-row')).toHaveCount(1);
});
