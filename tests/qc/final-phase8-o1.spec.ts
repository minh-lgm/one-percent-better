// Final QC phase 8: O-1 measurement (identical file run on main 8b9a1d7 and on the phase-8 branch).
// (1) import an open-ended goal starting 0001-01-01 and time #/goals/<id>; (2) does the Goal form accept start 0001-01-01?
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { EN, fixturePath, freezeClock, gotoHash } from '../../e2e/helpers/app';

const NOW = new Date('2026-11-04T10:00:00+07:00');
test('O-1: goal detail of an open-ended goal starting 0001-01-01; Goal form with start 0001-01-01', async ({ page }) => {
  test.setTimeout(280_000);
  await freezeClock(page, NOW);
  const d = JSON.parse(readFileSync(fixturePath(process.env.O1_FIXTURE ?? 'q1-goal-only-backup.json'), 'utf8')) as { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>> };
  const mk = (id: string, name: string, startDate: string, endDate: string | null) => ({ id, name, why: '', targetType: 'daily', targetMinutes: 20, startDate, endDate, archived: false, createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' });
  if (process.env.O1_EXTRA) d.goals.push(mk('x1', 'Ends9999', '9995-01-01', '9999-12-31'), mk('x2', 'OpenEnded', '2026-01-01', null), mk('x3', 'OpenFuture', '9999-12-31', null));
  d.goals.push({ id: 'x4', name: 'Starts0001', why: '', targetType: 'daily', targetMinutes: 20, startDate: '0001-01-01', endDate: null, archived: false, createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' });
  d.entries.push({ id: 'ex2', goalId: 'x4', date: '0001-01-01', minutes: 10, note: '', source: 'manual', createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' });
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
  for (const h of (process.env.O1_WALK ?? '').split(',').filter(Boolean)) { await gotoHash(page, h); await page.waitForTimeout(500); }
  const t0 = Date.now();
  await gotoHash(page, '/goals/x4');
  await expect(page.getByRole('heading', { level: 1, name: 'Starts0001' })).toBeVisible({ timeout: 250_000 });
  const tHeading = Date.now() - t0;
  await page.evaluate(() => 1); // returns only when the main thread is free again
  console.log(`O1-MEASURE goal-detail heading ${tHeading} ms, main thread free after ${Date.now() - t0} ms`);
  // Goal form
  await gotoHash(page, '/goals/new');
  await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('FormEarly');
  await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('20');
  await page.getByLabel(new RegExp(`^${EN.goal.form.startLabel}`)).fill('0001-01-01');
  await page.getByRole('button', { name: EN.goal.form.save }).click();
  await page.waitForTimeout(1500);
  const alerts = await page.getByRole('alert').allTextContents();
  console.log(`O1-MEASURE form url=${page.url()} alerts=${JSON.stringify(alerts)}`);
});
