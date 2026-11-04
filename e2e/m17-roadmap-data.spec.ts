// M17-AC5 / AC7 / AC8 / AC9 (phase 8, "today" = 2026-11-04): import Q1 → the Big goals list; a v1 file keeps the
// roadmap; export writes schemaVersion 2; deleting the linked goal unlinks; a raw Dexie v2 database opens on v3;
// the screen and its strings are lazy and still work offline after the first visit; 360 px vi; axe.
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseBackupFile, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, goalCard, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from './helpers/app';

const DB = 'one-percent-better';

const roadmapRow = (page: Page) => page.getByTestId('roadmap-row');
const navItems = (page: Page) => page.locator('.nav .item');

async function switchToVi(page: Page): Promise<void> {
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: EN.settings.language.option.vi }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}

test.describe('M17 Big goals — data and list', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('M17-AC8/AC7: import Q1 (D3 roadmap line) → 5 nav items, Big goals third → list row QPT 21 tuần 1/21 On track 5.8 h of 16 h 125 days; lazy chunks + namespace requested only then; offline reload keeps it', async ({ page, context }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    expect(requested.filter((u) => /Roadmap|roadmap/.test(u))).toEqual([]);

    await chooseBackupFile(page, 'q1-roadmap-backup.json');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This backup has 6 goals, 29 entries, exported 2026-11-04.');
    await expect(dialog.getByTestId('confirm-note')).toHaveText('Big goals: 1 in this backup, 0 on this device now. Importing replaces them.');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toContainText('Backup imported: 6 goals, 29 entries');

    await expect(navItems(page)).toHaveCount(5);
    await expect(navItems(page)).toHaveText([EN.nav.today, EN.nav.goals, EN.nav.roadmaps, EN.nav.review, EN.nav.settings]);
    // The D3 line already pulled the `roadmap` namespace (both languages) — after the cold load, not with it.
    expect(requested.some((u) => /\/assets\/roadmap\.en-.*\.js$/.test(u)), requested.join('\n')).toBe(true);
    expect(requested.some((u) => /\/assets\/roadmap\.vi-.*\.js$/.test(u)), requested.join('\n')).toBe(true);
    expect(requested.filter((u) => /\/assets\/Roadmaps-.*\.js$/.test(u))).toEqual([]);
    const before = requested.length;
    await navItems(page).nth(2).click();
    await expect(page).toHaveURL(/#\/roadmaps$/);
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeVisible();
    await expect(navItems(page).nth(2)).toHaveAttribute('aria-current', 'page');
    const lazy = requested.slice(before);
    expect(lazy.some((u) => /\/assets\/Roadmaps-.*\.js$/.test(u)), lazy.join('\n')).toBe(true);
    expect(lazy.some((u) => /\/assets\/roadmap-service-.*\.js$/.test(u)), lazy.join('\n')).toBe(true);

    const row = roadmapRow(page);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('heading', { level: 2 })).toHaveText('QPT 21 tuần');
    await expect(row.getByTestId('roadmap-goal')).toHaveText('Goal: QPT study');
    await expect(row.getByTestId('roadmap-progress')).toHaveText('Done 1/21');
    await expect(row.getByTestId('pace-chip')).toHaveText('On track');
    await expect(row.getByTestId('roadmap-hours')).toHaveText('Studied 5.8 h of 16 h');
    await expect(row.getByTestId('roadmap-milestone')).toHaveText('Thi QPT: 125 days left');
    await expectAxeClean(page);

    // Offline after the first visit: the lazy chunk and the namespace come from the precache (NFR-02, NFR-25).
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeVisible();
    await expect(roadmapRow(page).getByTestId('roadmap-hours')).toHaveText('Studied 5.8 h of 16 h');
    await context.setOffline(false);
  });

  test('M17-AC7: a schemaVersion 1 file keeps the roadmap and unlinks the missing goal (D3 "kept" line); export writes schemaVersion 2 with the four arrays', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await chooseBackupFile(page, 'sample-backup.json');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This backup has 5 goals, 23 entries');
    await expect(dialog.getByTestId('confirm-note')).toHaveText('Big goals: this older backup has none, so the 1 on this device are kept. Links to goals that aren\'t in the backup are removed.');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toContainText('Backup imported: 5 goals, 23 entries');

    await gotoHash(page, '/roadmaps');
    const row = roadmapRow(page);
    await expect(row.getByRole('heading', { level: 2 })).toHaveText('QPT 21 tuần');
    await expect(row.getByTestId('roadmap-goal')).toHaveText('No goal linked');
    await expect(row.getByTestId('roadmap-hours')).toHaveText('Study time: —');
    await expect(row.getByTestId('roadmap-progress')).toHaveText('Done 1/21');

    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const download = await downloadPromise;
    const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as Record<string, unknown[]> & { schemaVersion: number };
    expect(file.schemaVersion).toBe(2);
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(23);
    expect([file.roadmaps.length, file.roadmapPhases.length, file.roadmapItems.length, file.roadmapCheckpoints.length]).toEqual([1, 5, 21, 5]);
    expect((file.roadmaps[0] as { goalId: unknown }).goalId).toBeNull();
    expect(JSON.stringify(file)).not.toMatch(/"(deletedAt|dirty)"/);

    // A v1 file carrying junk roadmap keys is accepted and leaves the roadmap alone.
    await chooseBackupFile(page, 'v1-backup-with-roadmap-keys.json');
    await expect(dialog.getByTestId('confirm-note')).toContainText('this older backup has none, so the 1 on this device are kept');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(dialog).toBeHidden();
    await gotoHash(page, '/roadmaps');
    await expect(roadmapRow(page)).toHaveCount(1);
  });

  test('M17-AC5 (A-79): deleting the linked goal on this device unlinks the roadmap; a v2 file without roadmaps removes it', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/goals');
    const goalRow = page.getByTestId('goal-row').filter({ hasText: 'QPT study' });
    await goalRow.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
    await gotoHash(page, '/roadmaps');
    await expect(roadmapRow(page).getByTestId('roadmap-goal')).toHaveText('No goal linked');
    await expect(roadmapRow(page).getByTestId('roadmap-hours')).toHaveText('Study time: —');
    await expect(roadmapRow(page).getByTestId('pace-chip')).toHaveText('On track');

    await importBackup(page, 'q1-goal-only-backup.json');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toContainText(ROADMAP_EN.list.empty);
    await expect(page.getByTestId('roadmaps-empty').getByRole('button')).toHaveCount(0);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'QPT study')).toBeVisible();
  });

  test('M17-AC9: vi at 360×740 — "Mục tiêu lớn" third, 64 px tab bar (+1 px border), toast above it, list in Vietnamese, no horizontal scroll, scan clean, axe', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await switchToVi(page);
    await expect(navItems(page)).toHaveText([VI.nav.today, VI.nav.goals, 'Mục tiêu lớn', VI.nav.review, VI.nav.settings]);
    const nav = await page.locator('.nav').boundingBox();
    expect(nav!.height).toBeGreaterThanOrEqual(64);
    expect(nav!.height).toBeLessThanOrEqual(65);
    expect(nav!.width).toBeLessThanOrEqual(360);
    const toastBottom = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'toast-region';
      document.body.append(el);
      const value = getComputedStyle(el).bottom;
      el.remove();
      return value;
    });
    expect(toastBottom).toBe('76px'); // 64 + 0 + 12
    await expectNoHorizontalScroll(page);

    await navItems(page).nth(2).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mục tiêu lớn' })).toBeVisible();
    await expect(navItems(page).nth(2)).toHaveAttribute('aria-current', 'page');
    const row = roadmapRow(page);
    await expect(row.getByTestId('roadmap-goal')).toHaveText('Mục tiêu: QPT study');
    await expect(row.getByTestId('roadmap-progress')).toHaveText('Xong 1/21');
    await expect(row.getByTestId('pace-chip')).toHaveText(ROADMAP_VI.pace.onTrack);
    await expect(row.getByTestId('roadmap-hours')).toHaveText('Đã học 5,8 giờ / 16 giờ');
    await expect(row.getByTestId('roadmap-milestone')).toHaveText('Thi QPT: còn 125 ngày');
    await expect(page.getByRole('list', { name: ROADMAP_VI.list.listLabel })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    // Empty state in vi too.
    await importBackup(page, 'q1-goal-only-backup.json', VI);
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toContainText('Chưa có mục tiêu lớn nào');
    await expectNoViLeaks(page);
  });

  test('M17-AC5 (NFR-27): a raw Dexie v2 database (IndexedDB 20) with S1-like rows opens on v3 (30): rows intact, four empty roadmap stores', async ({ page }) => {
    await page.addInitScript(
      ({ db }) => {
        const stamp = '2026-10-20T01:00:00.000Z';
        const goal = { id: 'gq', name: 'QPT study', why: '', targetType: 'daily', targetMinutes: 60, startDate: '2026-10-20', endDate: null, archived: false, createdAt: stamp, updatedAt: stamp, deletedAt: null, dirty: 0 };
        const entries = [
          ['2026-10-27', 60],
          ['2026-10-29', 90],
          ['2026-11-01', 120],
        ].map(([date, minutes], i) => ({ id: `e${i}`, goalId: 'gq', date, minutes, note: '', source: 'manual', createdAt: stamp, updatedAt: stamp, deletedAt: null, dirty: 0 }));
        const w = window as unknown as { __v2Seed?: Promise<string> };
        w.__v2Seed = new Promise<string>((resolve) => {
          const req = indexedDB.open(db, 20);
          let created = false;
          req.onupgradeneeded = (ev) => {
            if (ev.oldVersion !== 0) return;
            created = true;
            const d = req.result;
            const g = d.createObjectStore('goals', { keyPath: 'id' });
            g.createIndex('dirty', 'dirty');
            const e = d.createObjectStore('entries', { keyPath: 'id' });
            e.createIndex('goalId', 'goalId');
            e.createIndex('date', 'date');
            e.createIndex('[goalId+date]', ['goalId', 'date']);
            e.createIndex('dirty', 'dirty');
            d.createObjectStore('kv', { keyPath: 'key' });
            const tx = req.transaction!;
            tx.objectStore('goals').put(goal);
            for (const x of entries) tx.objectStore('entries').put(x);
            tx.objectStore('kv').put({ key: 'locale', value: 'vi' });
            tx.objectStore('kv').put({ key: 'prefsSync', value: { reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 } } });
          };
          req.onsuccess = () => {
            const d = req.result;
            d.onversionchange = () => d.close();
            d.close();
            resolve(created ? 'seeded' : 'existing');
          };
          req.onerror = () => resolve(`error: ${String(req.error)}`);
          req.onblocked = () => resolve('blocked');
        });
      },
      { db: DB },
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoHash(page, '/today');
    expect(await page.evaluate(() => (window as unknown as { __v2Seed: Promise<string> }).__v2Seed)).toBe('seeded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(goalCard(page, 'QPT study')).toBeVisible();
    const raw = await page.evaluate(
      (db) =>
        new Promise<{ version: number; stores: string[]; goals: number; entries: number; roadmaps: number; locale: unknown }>((resolve, reject) => {
          const req = indexedDB.open(db);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const d = req.result;
            const stores = Array.from(d.objectStoreNames).sort();
            const tx = d.transaction(['goals', 'entries', 'roadmaps', 'kv'], 'readonly');
            const out = { version: d.version, stores, goals: 0, entries: 0, roadmaps: 0, locale: null as unknown };
            tx.objectStore('goals').count().onsuccess = (e) => (out.goals = (e.target as IDBRequest).result);
            tx.objectStore('entries').count().onsuccess = (e) => (out.entries = (e.target as IDBRequest).result);
            tx.objectStore('roadmaps').count().onsuccess = (e) => (out.roadmaps = (e.target as IDBRequest).result);
            tx.objectStore('kv').get('locale').onsuccess = (e) => (out.locale = (e.target as IDBRequest).result?.value);
            tx.oncomplete = () => {
              d.close();
              resolve(out);
            };
          };
        }),
      DB,
    );
    expect(raw.version).toBe(30);
    expect(raw.stores).toEqual(['entries', 'goals', 'kv', 'roadmapCheckpoints', 'roadmapItems', 'roadmapPhases', 'roadmaps']);
    expect(raw.goals).toBe(1);
    expect(raw.entries).toBe(3);
    expect(raw.roadmaps).toBe(0);
    expect(raw.locale).toBe('vi');
    expect(errors).toEqual([]);
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toContainText('Chưa có mục tiêu lớn nào');
  });
});
