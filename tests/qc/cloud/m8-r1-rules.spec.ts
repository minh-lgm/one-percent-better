// QC M8 round 1 - exploratory checks of the A-30 rules through the real UI with a frozen clock (cloud ON, mock Supabase):
// exact thresholds (7 days / 10 entries / 14-day snooze / 3 dismissals), what counts as "live" data, year boundary,
// import / v1-database sources of firstDataAt, damaged kv rows, clock skew, two tabs, priority over BackupBanner.
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, collectErrors, expectSyncState, signInAsMinh, signOutDialog } from '../../../e2e/cloud/helpers';
import { EN, FIXED_TIME, freezeClock, goalCard, gotoHash, kvGet, logTime, toast } from '../../../e2e/helpers/app';

const DAY = 86_400_000;
const banner = (page: Page) => page.getByTestId('login-prompt-banner');
const backupBanner = (page: Page) => page.getByTestId('backup-banner');

interface G {
  id: string;
  name: string;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  archived?: boolean;
}
interface E {
  id: string;
  goalId: string;
  date: string;
  createdAt: string;
  minutes?: number;
}

function payload(goals: G[], entries: E[]) {
  const file = {
    app: 'one-percent-better',
    schemaVersion: 1,
    exportedAt: '2026-10-09T03:00:00.000Z',
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      why: '',
      targetType: 'daily',
      targetMinutes: 60,
      startDate: g.startDate ?? '2026-09-01',
      endDate: g.endDate ?? '2026-12-31',
      archived: g.archived ?? false,
      createdAt: g.createdAt,
      updatedAt: g.createdAt,
    })),
    entries: entries.map((e) => ({ id: e.id, goalId: e.goalId, date: e.date, minutes: e.minutes ?? 5, note: '', source: 'manual', createdAt: e.createdAt, updatedAt: e.createdAt })),
    settings: { reminderEnabled: false, reminderTime: '20:00', lastReminderDate: null, lastBackupAt: null, plusOneShown: {} },
  };
  return { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) };
}

async function importPayload(page: Page, file: ReturnType<typeof payload>): Promise<void> {
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles(file);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
}

async function putKv(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: k as string, value: v });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as [string, unknown],
  );
}

async function today(page: Page, at: Date = FIXED_TIME): Promise<void> {
  await freezeClock(page, at);
  await page.goto('#/today');
  await page.reload(); // a hash-only goto does not reload: the app must see the new clock
  await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
}

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test.describe('QC M8-AC1 in the browser: thresholds are exact', () => {
  test('age: first record 7 days minus 1 second ago -> no banner; exactly 7 days -> banner (0 entries)', async ({ page }) => {
    const created = '2026-10-01T03:00:00.000Z';
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: created }], []));
    const t0 = Date.parse(created);
    await today(page, new Date(t0 + 7 * DAY - 1000));
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await today(page, new Date(t0 + 7 * DAY));
    await expect(banner(page)).toBeVisible();
  });

  test('count: 9 entries and a fresh goal -> no banner; the 10th entry (typed on Today) shows it without reload; deleting it hides it again (tombstones do not count)', async ({ page }) => {
    const fresh = '2026-10-09T02:00:00.000Z';
    const entries: E[] = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, goalId: 'g1', date: `2026-09-${String(20 + i).padStart(2, '0')}`, createdAt: fresh }));
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: fresh }], entries));
    await today(page);
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await logTime(page, 'Read', 5);
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expect(banner(page)).toBeVisible();
    await goalCard(page, 'Read').getByRole('button', { name: 'Delete entry: 5 min' }).click();
    await goalCard(page, 'Read')
      .getByRole('group', { name: /^Confirm delete/ })
      .getByRole('button', { name: EN.common.delete })
      .click();
    await expect(banner(page)).toHaveCount(0);
  });

  test('archived goal keeps its live entries in the count; deleting the goal (soft delete) removes them', async ({ page }) => {
    const fresh = '2026-10-09T02:00:00.000Z';
    const entries: E[] = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, goalId: 'g1', date: `2026-09-${String(20 + i).padStart(2, '0')}`, createdAt: fresh }));
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: fresh }], entries));
    await today(page);
    await expect(banner(page)).toBeVisible();
    await gotoHash(page, '/goals');
    const row = page.getByTestId('goal-row').filter({ hasText: 'Read' });
    await row.getByRole('button', { name: EN.goals.archive }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalArchived);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noActive })).toBeVisible();
    await expect(banner(page), 'archived goal with 10 live entries: banner expected (A-30 counts live entries)').toBeVisible();
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await gotoHash(page, '/today');
    await expect(banner(page)).toHaveCount(0);
  });

  test('year boundary: first record 2026-12-28, now 2027-01-03 (6 d) -> none; 2027-01-04 (7 d) -> banner', async ({ page }) => {
    const created = '2026-12-28T03:00:00.000Z';
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: created, startDate: '2026-12-01', endDate: '2027-12-31' }], []));
    await today(page, new Date('2027-01-03T10:00:00+07:00'));
    await expect(banner(page)).toHaveCount(0);
    await today(page, new Date('2027-01-04T10:00:00+07:00'));
    await expect(banner(page)).toBeVisible();
  });

  test('snooze: Not now at T -> hidden at T+13d23h59m59s, back at T+14d; 3rd dismissal is final even 5 years later', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(banner(page)).toHaveCount(0);
    await today(page, new Date(FIXED_TIME.getTime() + 14 * DAY - 1000));
    await expect(banner(page)).toHaveCount(0);
    await today(page, new Date(FIXED_TIME.getTime() + 14 * DAY));
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await today(page, new Date(FIXED_TIME.getTime() + 28 * DAY));
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 3 });
    await today(page, new Date('2031-10-09T10:00:00+07:00'));
    await expect(banner(page)).toHaveCount(0);
    await expect(backupBanner(page)).toBeVisible();
  });
});

test.describe('QC M8: sources of firstDataAt', () => {
  test('import: a backup whose goal is older than 7 days shows the banner with 1 entry; one created yesterday does not', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-10-08T03:00:00.000Z' }], [{ id: 'e1', goalId: 'g1', date: '2026-10-08', createdAt: '2026-10-08T03:00:00.000Z' }]));
    await today(page);
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-20T03:00:00.000Z' }], [{ id: 'e1', goalId: 'g1', date: '2026-10-08', createdAt: '2026-10-08T03:00:00.000Z' }]));
    await today(page);
    await expect(banner(page)).toBeVisible();
  });

  test('earliest record wins over goal age: young goal + an entry created 10 days ago -> banner', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-10-08T03:00:00.000Z' }], [{ id: 'e1', goalId: 'g1', date: '2026-09-29', createdAt: '2026-09-29T03:00:00.000Z' }]));
    await today(page);
    await expect(banner(page)).toBeVisible();
  });

  test('a phase-1 (Dexie v1) database upgraded by this build: old rows keep their createdAt, so the banner shows without any new data', async ({ page }) => {
    await page.goto('manifest.webmanifest');
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('one-percent-better', 10);
          req.onupgradeneeded = () => {
            const d = req.result;
            d.createObjectStore('goals', { keyPath: 'id' });
            const e = d.createObjectStore('entries', { keyPath: 'id' });
            e.createIndex('goalId', 'goalId');
            e.createIndex('date', 'date');
            e.createIndex('[goalId+date]', ['goalId', 'date']);
            d.createObjectStore('kv', { keyPath: 'key' });
            const tx = req.transaction!;
            tx.objectStore('goals').put({ id: 'v1g', name: 'Old goal', why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-09-01', endDate: '2026-12-31', archived: false, createdAt: '2026-09-15T03:00:00.000Z', updatedAt: '2026-09-15T03:00:00.000Z' });
            tx.objectStore('entries').put({ id: 'v1e', goalId: 'v1g', date: '2026-09-16', minutes: 20, note: '', source: 'manual', createdAt: '2026-09-16T03:00:00.000Z', updatedAt: '2026-09-16T03:00:00.000Z' });
          };
          req.onsuccess = () => {
            req.result.close();
            resolve();
          };
          req.onerror = () => reject(req.error);
        }),
    );
    await today(page);
    await expect(goalCard(page, 'Old goal')).toBeVisible();
    await expect(banner(page)).toBeVisible();
  });
});

test.describe('QC M8: damaged or odd kv rows never crash the page', () => {
  const stale = '2026-09-01T03:00:00.000Z';
  const cases: Array<[string, unknown, boolean]> = [
    ['string', 'garbage', true],
    ['array', [1, 2, 3], true],
    ['null value', null, true],
    ['count as string, date garbage', { dismissCount: '3', lastDismissedAt: 'not a date', lastExportHintAt: 5 }, true],
    ['negative count', { dismissCount: -4, lastDismissedAt: null }, true],
    ['count 2.9 floors to 2 -> still shows once', { dismissCount: 2.9, lastDismissedAt: null }, true],
    ['count 3 -> never', { dismissCount: 3, lastDismissedAt: null }, false],
    ['count 1e9 -> never', { dismissCount: 1e9, lastDismissedAt: null }, false],
  ];
  for (const [label, value, shown] of cases) {
    test(`kv loginPrompt = ${label} -> banner ${shown ? 'shown' : 'hidden'}, no error`, async ({ page }) => {
      const errors = collectErrors(page);
      await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: stale }], []));
      await putKv(page, 'loginPrompt', value);
      await today(page);
      await expect(goalCard(page, 'Read')).toBeVisible();
      if (shown) await expect(banner(page)).toBeVisible();
      else await expect(banner(page)).toHaveCount(0);
      expect(errors.list).toEqual([]);
    });
  }

  test('clock skew: a "Not now" stamped in the future (device clock was wrong) should not silence the banner for decades', async ({ page }) => {
    // M8-D1 FIXED in M10 (A-46, 24 h tolerance); marker test.fail removed in M10 round 1. Auto-wait locator instead of count().
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: stale }], []));
    await putKv(page, 'loginPrompt', { dismissCount: 1, lastDismissedAt: '2099-01-01T00:00:00.000Z', lastExportHintAt: null });
    await today(page);
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toBeVisible();
  });
});

test.describe('QC M8: priority, tabs, offline, cancel', () => {
  test('LoginPromptBanner wins over BackupBanner; after "Not now" the backup banner takes the same slot', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    await expect(banner(page)).toBeVisible();
    await expect(backupBanner(page)).toHaveCount(0);
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(backupBanner(page)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('ReminderBanner (due) stays above the sign-in banner in DOM and on screen', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await putKv(page, 'settings', { reminderEnabled: true, reminderTime: '08:00', lastReminderDate: null, lastBackupAt: null, plusOneShown: {} });
    await today(page, new Date('2026-10-09T21:00:00+07:00'));
    const reminder = page.getByTestId('reminder-banner');
    await expect(reminder).toBeVisible();
    await expect(banner(page)).toBeVisible();
    const rb = (await reminder.boundingBox())!;
    const lb = (await banner(page).boundingBox())!;
    expect(rb.y).toBeLessThan(lb.y);
    const timerOrGoal = (await goalCard(page, 'Read').boundingBox())!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(timerOrGoal.y + 1);
  });

  test('two tabs: "Not now" in tab A hides the banner in tab B without a reload and counts once', async ({ page, context }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    const b = await context.newPage();
    await b.goto('#/today');
    await expect(banner(b)).toBeVisible();
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(banner(b)).toHaveCount(0, { timeout: 10_000 });
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 1 });
  });

  test('two tabs click "Not now" together: no error, count is 1 or 2 (no lost update below 1)', async ({ page, context }) => {
    const errors = collectErrors(page);
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    const b = await context.newPage();
    await b.goto('#/today');
    await expect(banner(b)).toBeVisible();
    const press = (p: Page) => p.evaluate(() => (document.querySelector('[data-testid="login-prompt-not-now"]') as HTMLButtonElement | null)?.click());
    await Promise.all([press(page), press(b)]);
    await expect(banner(page)).toHaveCount(0);
    const kv = (await kvGet(page, 'loginPrompt')) as { dismissCount: number };
    console.log(`QC double dismissal -> dismissCount ${kv.dismissCount}`);
    expect([1, 2]).toContain(kv.dismissCount);
    expect(errors.list).toEqual([]);
  });

  test('offline hides the banner, online brings it back; after cancelling on the Google page the banner is usable again', async ({ page, context }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    await expect(banner(page)).toBeVisible();
    await context.setOffline(true);
    await expect(banner(page)).toHaveCount(0);
    await context.setOffline(false);
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth/v1'));
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    console.log(`QC after cancel: url ${page.url()} banner ${await banner(page).count()}`);
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeEnabled();
  });
});

test.describe('QC M8-T1: kv loginPrompt is device-only state', () => {
  test('"Not now" survives Import (replace all) and Sign out -> Remove; a backup export does not contain it', async ({ page }) => {
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    await today(page);
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).click();
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 1 });
    await importPayload(page, payload([{ id: 'g1', name: 'Read', createdAt: '2026-09-01T03:00:00.000Z' }], []));
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 1, lastDismissedAt: FIXED_TIME.toISOString() });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 25_000);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await signOutDialog(page).getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 1, lastDismissedAt: FIXED_TIME.toISOString() });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const file = await (await download).createReadStream();
    let text = '';
    for await (const chunk of file) text += chunk.toString();
    expect(text).not.toMatch(/loginPrompt|dismissCount|lastExportHintAt/);
  });
});
