import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseBackupFile, createGoal, EN, expectAmount, expectAxeClean, freezeClock, goalCard, gotoHash, importBackup, kvGet, startTimer, toast } from './helpers/app';

const ORIGIN = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M3 backup', () => {
  test('M3-AC6: Export downloads 1percent-better-backup-2026-10-09.json with schemaVersion 1 and updates "Last backup"', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(ORIGIN)) external.push(req.url());
    });
    await importBackup(page);
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);
    await expect(page.getByTestId('backup-banner')).toContainText(EN.backup.banner.never);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('1percent-better-backup-2026-10-09.json');
    await expect(toast(page)).toHaveText(EN.toast.backupExported);
    const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as Record<string, unknown>;
    expect(file.app).toBe('one-percent-better');
    expect(file.schemaVersion).toBe(1);
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(23);
    expect(file.settings).toMatchObject({ reminderEnabled: false, reminderTime: '20:00' });
    expect(JSON.stringify(file)).not.toContain('locale');

    await expect(page.getByTestId('last-backup')).toHaveText('Last backup: 2026-10-09');
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('last-backup')).toHaveText('Last backup: 2026-10-09');
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('M3-AC7: importing sample-backup.json into a fresh context shows Read 0/30, Guitar 0/20, Spanish 0/17', async ({ page }) => {
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals })).toBeVisible();
    await importBackup(page);
    await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
    await gotoHash(page, '/today');
    await expectAmount(page, 'Read', '0/30');
    await expectAmount(page, 'Guitar', '0/20');
    await expectAmount(page, 'Spanish', '0/17');
    await expect(goalCard(page, 'Marathon prep')).toHaveCount(0);
    await gotoHash(page, '/goals');
    await expect(page.getByTestId('goal-row')).toHaveCount(5);
  });

  test('M3-AC8 + M3-AC12: preview "5 goals, 23 entries"; Cancel keeps "Temp"; Confirm replaces everything and clears the timer', async ({ page }) => {
    await createGoal(page, { name: 'Temp', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await startTimer(page, 'Temp');
    expect(await kvGet(page, 'activeTimer')).toMatchObject({ goalId: expect.any(String) });
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toContainText(EN.backup.banner.never);
    await page.getByTestId('backup-banner').getByRole('link', { name: EN.backup.banner.action }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();

    await chooseBackupFile(page, 'sample-backup.json');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: EN.import.title })).toBeVisible();
    await expect(dialog).toContainText("This backup has 5 goals, 23 entries, exported 2026-10-09. Importing replaces everything currently on this device (1 goal, 0 entries). This can't be undone.");
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await expectAxeClean(page);
    await dialog.getByRole('button', { name: EN.common.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: EN.settings.backup.import })).toBeFocused();
    await gotoHash(page, '/goals');
    await expect(page.getByTestId('goal-row')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Temp' })).toBeVisible();

    await chooseBackupFile(page, 'sample-backup.json');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    await gotoHash(page, '/goals');
    await expect(page.getByTestId('goal-row')).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'Temp' })).toHaveCount(0);
    for (const name of ['Read', 'Guitar', 'Spanish', 'Marathon prep', 'Old course']) await expect(page.getByRole('link', { name })).toBeVisible();
    await gotoHash(page, '/today');
    await expect(page.getByTestId('timer-card')).toHaveCount(0);
    await page.reload();
    await expectAmount(page, 'Read', '0/30');
  });

  test('M3-AC9: invalid files show an alert and leave the data untouched', async ({ page }) => {
    await createGoal(page, { name: 'Temp', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    const cases: Array<[string, string]> = [
      ['invalid-json.json', EN.errors.IMPORT_INVALID_JSON],
      ['invalid-schema.json', EN.errors.IMPORT_INVALID_SCHEMA],
      ['unsupported-version.json', 'This backup uses a format version (2) this app can\'t read.'],
      ['invalid-integrity.json', EN.errors.IMPORT_INTEGRITY],
    ];
    for (const [fixture, message] of cases) {
      await chooseBackupFile(page, fixture);
      await expect(page.getByRole('alert')).toContainText(message);
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await expectAxeClean(page);
    await gotoHash(page, '/goals');
    await expect(page.getByTestId('goal-row')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Temp' })).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);
    // The next valid import clears the alert.
    await importBackup(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('round-trip through the UI: export, change data, import the exported file → original data is back', async ({ page }) => {
    await importBackup(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const exported = await (await downloadPromise).path();
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page.getByTestId('goal-row')).toHaveCount(4);

    await gotoHash(page, '/settings');
    await page.getByTestId('import-file').setInputFiles(exported!);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This backup has 5 goals, 23 entries');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await gotoHash(page, '/goals/g1');
    await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible();
    await expect(page.getByTestId('history-row')).toHaveCount(8);
  });
});
