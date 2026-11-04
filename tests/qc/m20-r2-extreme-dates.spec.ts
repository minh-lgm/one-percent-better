// QC round 2 (M20): addDays now throws past 9999-12-31 / OPEN_END_QUERY_MAX. Import a backup whose goals sit at the date extremes
// and walk the screens that read dates (Today, Goals, Review, Goal detail, Day, Settings export): no ErrorBoundary, no page error, no NaN.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EN, FIXED_TIME_Q1, fixturePath, freezeClock, gotoHash } from '../../e2e/helpers/app';

type Backup = Record<string, Array<Record<string, unknown>>>;
const mk = (id: string, name: string, startDate: string, endDate: string | null, minutes: number) => ({
  id, name, why: '', targetType: 'daily', targetMinutes: minutes, startDate, endDate, archived: false,
  createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z',
});

async function importObj(page: Page, d: unknown) {
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("doesn't look like");
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
}

test.describe('M20 QC r2: extreme dates after the addDays contract change', () => {
  test('goal ending 9999-12-31, open-ended goal, goal starting 9999-12-31, entry at 0001-01-01 (future entries are refused by the import, by design)', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await freezeClock(page, FIXED_TIME_Q1);
    const d = JSON.parse(readFileSync(fixturePath('q1-goal-only-backup.json'), 'utf8')) as Backup;
    d.goals.push(
      mk('x1', 'Ends9999', '9995-01-01', '9999-12-31', 30),
      mk('x2', 'OpenEnded', '2026-01-01', null, 20),
      mk('x3', 'OpenFuture', '9999-12-31', null, 20),
      mk('x4', 'Starts0001', '0001-01-01', null, 20),
    );
    d.entries.push(
      { id: 'ex2', goalId: 'x4', date: '0001-01-01', minutes: 10, note: '', source: 'manual', createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' },
    );
    await importObj(page, d);
    const visit = async (hash: string) => {
      const t0 = Date.now();
      await gotoHash(page, hash);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page.getByTestId('error-boundary'), hash).toHaveCount(0);
      await expect(page.locator('body'), hash).not.toContainText(/NaN|Invalid Date/);
      console.log(`VISIT ${hash} ${Date.now() - t0} ms`);
    };
    for (const h of ['/today', '/goals', '/review', '/goals/x1', '/goals/x2', '/goals/x3', '/goals/x4', '/day/9999-12-31', '/day/9999-12-30', '/day/0001-01-01', '/day/0001-01-02', '/roadmaps', '/settings']) await visit(h);
    // DateNav both buttons at the edges
    await gotoHash(page, '/day/9999-12-31');
    await page.getByRole('button', { name: EN.day.prev }).click();
    await expect(page).toHaveURL(/day\/9999-12-30$/);
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
    await gotoHash(page, '/day/0001-01-02');
    await page.getByRole('button', { name: EN.day.prev }).click();
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
    // export round trip
    await gotoHash(page, '/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const text = readFileSync((await (await dl).path())!, 'utf8');
    expect(text).toContain('9999-12-31');
    await page.getByTestId('import-file').setInputFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText("doesn't look like");
    expect(errors).toEqual([]);
  });
});
