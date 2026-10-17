/**
 * M10-AC9 / M10-AC11 (DESIGN v3.1): a well-formed backup with a value outside the app's limits gets its
 * own Alert (`errors.IMPORT_INVALID_SCHEMA_outOfRange`, en and vi) while structural problems keep the
 * generic sentence; Review columns carry value labels only when there is room (1440 px yes, 360 px no);
 * the privacy link is in About even with the cloud off; vi scans are clean.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { EN, expectNoHorizontalScroll, freezeClock, gotoHash, importBackup, scanVi, VI } from './helpers/app';

type Backup = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; [k: string]: unknown };
const sample = (): Backup => JSON.parse(readFileSync(new URL('./fixtures/sample-backup.json', import.meta.url), 'utf8')) as Backup;

async function chooseJson(page: Page, content: unknown) {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });
}

const withGoal = (patch: Record<string, unknown>): Backup => {
  const f = sample();
  f.goals = [{ ...f.goals[0], ...patch }, ...f.goals.slice(1)];
  return f;
};
const withEntry = (patch: Record<string, unknown>): Backup => {
  const f = sample();
  f.entries = [{ ...f.entries[0], ...patch }, ...f.entries.slice(1)];
  return f;
};

const OUT_OF_RANGE: Array<[string, () => unknown]> = [
  ['daily goal 600,000 min', () => withGoal({ targetType: 'daily', targetMinutes: 600_000 })],
  ['period 2000-01-01 → 2099-12-31', () => withGoal({ startDate: '2000-01-01', endDate: '2099-12-31' })],
  ['name 61 chars', () => withGoal({ name: 'n'.repeat(61) })],
  ['why 281 chars', () => withGoal({ why: 'w'.repeat(281) })],
  ['entry 1441 min', () => withEntry({ minutes: 1441 })],
  ['entry 12.5 min', () => withEntry({ minutes: 12.5 })],
  ['note 281 chars', () => withEntry({ note: 'n'.repeat(281) })],
];
const STRUCTURAL: Array<[string, () => unknown]> = [
  ['root []', () => []],
  ['app other-app', () => ({ ...sample(), app: 'other-app' })],
  ['entry minutes "30"', () => withEntry({ minutes: '30' })],
  ['goal id 65 chars', () => withGoal({ id: 'x'.repeat(65) })],
];

test.describe('M10-AC9 import out-of-range sentence (en)', () => {
  test('each out-of-range file → errors.IMPORT_INVALID_SCHEMA_outOfRange; structural → errors.IMPORT_INVALID_SCHEMA; future entry → IMPORT_INTEGRITY; data untouched', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
    await gotoHash(page, '/settings');
    const alert = page.locator('section[aria-labelledby="h-backup"]').getByRole('alert');
    for (const [label, file] of OUT_OF_RANGE) {
      await chooseJson(page, file());
      await expect(alert, label).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA_outOfRange);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    for (const [label, file] of STRUCTURAL) {
      await chooseJson(page, file());
      await expect(alert, label).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA);
    }
    const future = sample();
    future.entries = [...future.entries, { ...future.entries[0], id: 'future', date: '2026-10-10' }];
    await chooseJson(page, future);
    await expect(alert).toHaveText(EN.errors.IMPORT_INTEGRITY);
    await gotoHash(page, '/goals');
    await expect(page.getByTestId('goal-row')).toHaveCount(5);
  });
});

test.describe('M10-AC9 vi', () => {
  test.use({ locale: 'vi-VN' });
  test('the vi sentence, no leaks', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/settings');
    await chooseJson(page, withGoal({ targetType: 'daily', targetMinutes: 600_000 }));
    const alert = page.locator('section[aria-labelledby="h-backup"]').getByRole('alert');
    await expect(alert).toHaveText(VI.errors.IMPORT_INVALID_SCHEMA_outOfRange);
    expect(await scanVi(page)).toEqual([]);
  });
});

test.describe('M10-AC11 bar labels at 1440 px (en)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('every column ≥ 3 min has a label in hours; hidden table and summary unchanged; privacy link in About; axe clean', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
    await gotoHash(page, '/review');
    const monthly = page.getByTestId('chart-monthly');
    await expect(monthly.locator('svg.recharts-surface')).toBeVisible();
    await expect(monthly.getByTestId('bar-value')).toHaveCount(4);
    expect(await monthly.getByTestId('bar-value').allTextContents()).toEqual(['1.0', '0.3', '3.5', '4.7']);
    const weekly = page.getByTestId('chart-weekly');
    expect(await weekly.getByTestId('bar-value').count()).toBeGreaterThan(0);
    await expect(page.getByRole('table', { name: 'Months of 2026' }).getByRole('row')).toHaveCount(13);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

    await gotoHash(page, '/settings');
    const link = page.getByTestId('privacy-link');
    await expect(link).toHaveText(EN.settings.about.privacyLink);
    expect(await link.getAttribute('href')).toBe('/privacy.html');
    expect(await link.getAttribute('target')).toBeNull();
  });
});

test.describe('M10-AC11 bar labels at 360 px (vi)', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'vi-VN' });
  test('no label at all; no horizontal scroll; vi scan clean on Review and Settings', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/review');
    const monthly = page.getByTestId('chart-monthly');
    await expect(monthly.locator('svg.recharts-surface')).toBeVisible();
    await expect(monthly.getByTestId('bar-value')).toHaveCount(0);
    await expect(page.getByTestId('chart-weekly').getByTestId('bar-value')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    expect(await scanVi(page)).toEqual([]);
    await gotoHash(page, '/settings');
    expect(await scanVi(page)).toEqual([]);
    await expect(page.getByTestId('privacy-link')).toHaveText(VI.settings.about.privacyLink);
  });
});
