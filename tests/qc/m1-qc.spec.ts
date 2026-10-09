// QC-owned acceptance + exploratory tests for M1 (round 1). Independent of e2e/helpers.
// Runs through the project Playwright config (preview on :4173, fixed clock 2026-10-09T10:00+07:00).
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ORIGIN = 'http://localhost:4173';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function boot(page: Page, hash = '/today') {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+07:00'));
  await page.goto(`${ORIGIN}/#${hash}`);
}

interface GoalOpts {
  name: string;
  why?: string;
  daily?: string;
  total?: string;
  start?: string;
  end?: string;
}

async function newGoal(page: Page, o: GoalOpts, submit = true) {
  await page.goto(`${ORIGIN}/#/goals/new`);
  await page.getByLabel(/^Name/).fill(o.name);
  if (o.why !== undefined) await page.getByLabel(/^Why/).fill(o.why);
  if (o.total !== undefined) {
    await page.getByRole('radio', { name: 'Total hours' }).check();
    await page.getByRole('textbox', { name: /^Total hours/ }).fill(o.total);
  } else if (o.daily !== undefined) {
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill(o.daily);
  }
  if (o.start) await page.getByLabel(/^Start date/).fill(o.start);
  if (o.end) {
    await page.getByRole('radio', { name: 'On a specific date' }).check();
    await page.getByLabel(/^End date/).fill(o.end);
  }
  if (submit) await page.getByRole('button', { name: 'Save goal' }).click();
}

interface Dump {
  goals: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
  kv: Array<{ key: string; value: unknown }>;
}

async function dbDump(page: Page): Promise<Dump> {
  return page.evaluate(
    () =>
      new Promise<Dump>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const out: Record<string, unknown[]> = {};
          let n = 0;
          for (const s of ['goals', 'entries', 'kv']) {
            const r = db.transaction(s).objectStore(s).getAll();
            r.onsuccess = () => {
              out[s] = r.result as unknown[];
              if (++n === 3) {
                db.close();
                resolve(out as unknown as Dump);
              }
            };
          }
        };
      }),
  );
}

async function goalCount(page: Page): Promise<number> {
  return (await dbDump(page)).goals.length;
}

async function logTime(page: Page, minutes: string, note = '') {
  await page.getByRole('button', { name: 'Log time' }).click();
  await page.getByLabel(/^Minutes/).fill(minutes);
  if (note) await page.getByLabel(/^Note/).fill(note);
  await page.getByRole('button', { name: 'Save entry' }).click();
}

async function seriousAxe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(bad.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), label).toEqual([]);
}

test.describe('M1 QC: goal form validation through the UI (AC3)', () => {
  const cases: Array<[string, GoalOpts]> = [
    ['whitespace-only name', { name: '   ', daily: '30' }],
    ['61-char name', { name: 'x'.repeat(61), daily: '30' }],
    ['daily 0', { name: 'A', daily: '0' }],
    ['daily 1441', { name: 'A', daily: '1441' }],
    ['daily 12.5', { name: 'A', daily: '12.5' }],
    ['daily empty', { name: 'A', daily: '' }],
    ['daily letters', { name: 'A', daily: 'abc' }],
    ['daily negative', { name: 'A', daily: '-5' }],
    ['total 0', { name: 'A', total: '0' }],
    ['total 10001', { name: 'A', total: '10001' }],
    ['why 281 chars', { name: 'A', why: 'y'.repeat(281), daily: '30' }],
    ['total 100 h in a single day', { name: 'A', total: '100', start: '2026-10-09', end: '2026-10-09' }],
    ['end before start', { name: 'A', daily: '30', start: '2026-10-09', end: '2026-10-08' }],
    ['period of 1828 days', { name: 'A', daily: '30', start: '2026-01-01', end: '2031-01-02' }],
  ];
  for (const [label, input] of cases) {
    test(`rejects ${label}; nothing saved; error inline`, async ({ page }) => {
      await boot(page);
      await newGoal(page, input);
      await expect(page.getByRole('alert').first()).toBeVisible();
      const invalid = page.locator('[aria-invalid="true"]').first();
      await expect(invalid).toBeVisible();
      const describedBy = await invalid.getAttribute('aria-describedby');
      expect(describedBy, 'invalid field must point at its error via aria-describedby').toBeTruthy();
      expect(await goalCount(page)).toBe(0);
      expect(page.url()).toContain('#/goals/new');
    });
  }

  test('1827-day period and 60-char name are accepted', async ({ page }) => {
    await boot(page);
    await newGoal(page, { name: 'n'.repeat(60), daily: '30', start: '2026-01-01', end: '2031-01-01' });
    await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
    expect(await goalCount(page)).toBe(1);
  });

  test('cleared start date is rejected, nothing saved', async ({ page }) => {
    await boot(page);
    await page.goto(`${ORIGIN}/#/goals/new`);
    await page.getByLabel(/^Name/).fill('A');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByLabel(/^Start date/).fill('');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByLabel(/^Start date/)).toHaveAttribute('aria-invalid', 'true');
    expect(await goalCount(page)).toBe(0);
  });
});

test.describe('M1 QC: record shape (AC13) and double submit', () => {
  test('UUID ids and timestamps; double-click on both Save buttons creates exactly one record', async ({ page }) => {
    await boot(page);
    await newGoal(page, { name: 'Read', daily: '30' }, false);
    await page.getByRole('button', { name: 'Save goal' }).dblclick();
    await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
    await page.goto(`${ORIGIN}/#/today`);
    await page.getByRole('button', { name: 'Log time' }).click();
    await page.getByLabel(/^Minutes/).fill('10');
    await page.getByRole('button', { name: 'Save entry' }).dblclick();
    await expect(page.locator('.amount')).toContainText('/30');
    const dump = await dbDump(page);
    expect(dump.goals).toHaveLength(1);
    expect(dump.goals[0].id).toMatch(UUID);
    expect(typeof dump.goals[0].createdAt).toBe('string');
    expect(typeof dump.goals[0].updatedAt).toBe('string');
    expect(dump.entries).toHaveLength(1);
    expect(dump.entries[0].id).toMatch(UUID);
    expect(dump.kv.find((r) => r.key === 'locale')).toBeUndefined();
  });
});

test.describe('M1 QC: safety (AC12)', () => {
  test('HTML-like goal name, why and note are inert text; no dialog', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    await boot(page);
    const evil = '<img src=x onerror=alert(1)>';
    await newGoal(page, { name: evil, why: '<script>alert(2)</script>', daily: '30' });
    await expect(page.locator('main').getByText(evil).first()).toBeVisible();
    await page.goto(`${ORIGIN}/#/today`);
    await logTime(page, '5', '<svg onload=alert(3)>');
    await expect(page.locator('main').getByText('<svg onload=alert(3)>')).toBeVisible();
    const id = (await dbDump(page)).goals[0].id as string;
    await page.goto(`${ORIGIN}/#/goals/${id}/edit`);
    await expect(page.getByLabel(/^Name/)).toHaveValue(evil);
    expect(await page.locator('main img, main script, main svg[onload]').count()).toBe(0);
    await page.waitForTimeout(500);
    expect(dialogs).toBe(0);
  });

  test('no request leaves the origin across the main flow incl. language switch', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
    });
    await boot(page);
    await newGoal(page, { name: 'Read', daily: '30' });
    await page.goto(`${ORIGIN}/#/today`);
    await logTime(page, '30');
    await page.goto(`${ORIGIN}/#/settings`);
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await page.waitForTimeout(500);
    expect(foreign).toEqual([]);
  });
});

test.describe('M1 QC: layout robustness at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('long unbroken name / why / note do not cause horizontal scroll', async ({ page }) => {
    await boot(page);
    await newGoal(page, { name: 'W'.repeat(60), why: 'v'.repeat(280), daily: '30' });
    for (const hash of ['/goals', '/today']) {
      await page.goto(`${ORIGIN}/#${hash}`);
      if (hash === '/today') {
        await logTime(page, '5', 'n'.repeat(280));
        await expect(page.locator('main').getByText('n'.repeat(280))).toBeVisible();
      }
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `${hash} scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw);
    }
  });
});

test.describe('M1 QC: routing (AC14)', () => {
  test('unknown routes show Not found with link to Today; unknown goal id on edit shows Goal not found', async ({ page }) => {
    await boot(page, '/abc');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Today' }).click();
    await expect(page).toHaveURL(/#\/today$/);
    await page.goto(`${ORIGIN}/#/goals/does-not-exist/edit`);
    await expect(page.getByRole('heading', { level: 1, name: 'Goal not found' })).toBeVisible();
    await page.goto(`${ORIGIN}/#/`);
    await expect(page).toHaveURL(/#\/today$/);
  });
});

test.describe('M1 QC: language (AC15/AC16)', () => {
  test('choice persists across reload and new page; kv written only after explicit choice', async ({ page, context }) => {
    await boot(page, '/settings');
    expect((await dbDump(page)).kv.find((r) => r.key === 'locale')).toBeUndefined();
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(await page.title()).not.toContain('Settings');
    expect(await page.evaluate(() => (window as unknown as { __noReload: boolean }).__noReload)).toBe(true);
    await expect(page.locator('.seg span[lang="en"]')).toHaveText('English');
    await expect(page.locator('.seg span[lang="vi"]')).toHaveText('Tiếng Việt');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect((await dbDump(page)).kv.find((r) => r.key === 'locale')?.value).toBe('vi');
    const p2 = await context.newPage();
    await p2.clock.setFixedTime(new Date('2026-10-09T10:00:00+07:00'));
    await p2.goto(`${ORIGIN}/#/today`);
    await expect(p2.locator('html')).toHaveAttribute('lang', 'vi');
  });

  test('language control works with the keyboard; focus stays on the control; toast announces in the new language', async ({ page }) => {
    await boot(page, '/settings');
    await page.getByRole('radio', { name: 'English' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: /\S/ }).first()).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('radio', { name: 'English' })).toBeFocused();
  });

  test('junk saved locale value falls back to browser detection', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('one-percent-better');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put({ key: 'locale', value: 'fr' });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  });
});

test.describe('M1 QC: PWA and offline (AC11)', () => {
  test('manifest, SW control, offline reload on several routes, add entry offline, persists when back online', async ({ page, context }) => {
    await boot(page);
    const manifest = await (await page.request.get(`${ORIGIN}/manifest.webmanifest`)).json();
    expect(manifest).toMatchObject({ name: '1% Better per Day', short_name: '1% Better', display: 'standalone' });
    expect(manifest.start_url).toBeTruthy();
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await newGoal(page, { name: 'Read', daily: '30' });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    for (const hash of ['/today', '/goals', '/settings', '/goals/new']) {
      await page.goto(`${ORIGIN}/#${hash}`);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.goto(`${ORIGIN}/#/today`);
    await page.reload();
    await expect(page.getByText(/Offline/).first()).toBeVisible();
    await logTime(page, '15');
    await expect(page.locator('.amount')).toContainText('15/30');
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('.amount')).toContainText('15/30');
  });
});

test.describe('M1 QC: accessibility (AC12) incl. dark mode and keyboard', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe on Today, Goals, Settings and GoalForm with errors (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await boot(page);
      await newGoal(page, { name: 'Read', daily: '30' });
      await page.goto(`${ORIGIN}/#/today`);
      await logTime(page, '30');
      for (const hash of ['/today', '/goals', '/settings']) {
        await page.goto(`${ORIGIN}/#${hash}`);
        await page.waitForTimeout(300);
        await seriousAxe(page, `${scheme} ${hash}`);
      }
      await newGoal(page, { name: '', daily: 'x' });
      await seriousAxe(page, `${scheme} form with errors`);
    });
  }

  test('route change moves focus to h1; Esc closes the entry form and returns focus', async ({ page }) => {
    await boot(page);
    await newGoal(page, { name: 'Read', daily: '30' });
    await page.goto(`${ORIGIN}/#/today`);
    await page.getByRole('link', { name: 'Goals' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeFocused();
    await page.getByRole('link', { name: 'Today' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeFocused();
    await page.getByRole('button', { name: 'Log time' }).click();
    await expect(page.getByLabel(/^Minutes/)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Log time' })).toBeFocused();
  });
});
