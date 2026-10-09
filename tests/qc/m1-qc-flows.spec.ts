// QC-owned flow tests for M1 AC2, AC4-AC9, AC16-AC18 (round 1). Drives the built preview through the UI only.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import en from '../../src/i18n/resources/en.json' with { type: 'json' };
import vi from '../../src/i18n/resources/vi.json' with { type: 'json' };
import { flattenMessages } from '../../src/i18n/parity';
import { scanUntranslated, type ScanHit } from '../../src/test/i18n-scan';

const ORIGIN = 'http://localhost:4173';
const SCAN_DATA = { en: flattenMessages(en), vi: flattenMessages(vi) };

async function boot(page: Page, hash = '/today') {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+07:00'));
  await page.goto(`${ORIGIN}/#${hash}`);
}

async function viScan(page: Page): Promise<string[]> {
  const hits = await page.evaluate<ScanHit[]>(`(${scanUntranslated.toString()})(document, ${JSON.stringify(SCAN_DATA)})`);
  return hits.map((h) => `${h.text} (${h.reason})`);
}

async function createGoal(
  page: Page,
  o: { name: string; why?: string; daily?: string; total?: string; start?: string; end?: string },
) {
  await page.goto(`${ORIGIN}/#/goals/new`);
  await page.getByLabel(/^Name/).fill(o.name);
  if (o.why) await page.getByLabel(/^Why/).fill(o.why);
  if (o.total) {
    await page.getByRole('radio', { name: 'Total hours' }).check();
    await page.getByRole('textbox', { name: /^Total hours/ }).fill(o.total);
  } else {
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill(o.daily ?? '30');
  }
  if (o.start) await page.getByLabel(/^Start date/).fill(o.start);
  if (o.end) {
    await page.getByRole('radio', { name: 'On a specific date' }).check();
    await page.getByLabel(/^End date/).fill(o.end);
  }
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article', { name });

async function log(page: Page, name: string, minutes: string, note = '') {
  const c = card(page, name);
  await c.getByRole('button', { name: 'Log time' }).click();
  await c.getByLabel(/^Minutes/).fill(minutes);
  if (note) await c.getByLabel(/^Note/).fill(note);
  await c.getByRole('button', { name: 'Save entry' }).click();
}

test.describe('M1 QC flows', () => {
  test('AC2/AC4/AC5: dataset S1 goals created through the UI show correct status, Today shows only active, G3 = 0/17', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', daily: '30', start: '2026-10-01', end: '2026-10-31' });
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Read' })).toContainText('Active');
    await createGoal(page, { name: 'Guitar', daily: '20', start: '2026-09-01', end: '2026-12-31' });
    await createGoal(page, { name: 'Spanish', total: '100', start: '2026-01-01', end: '2026-12-31' });
    await createGoal(page, { name: 'Marathon prep', daily: '45', start: '2026-11-01', end: '2026-11-30' });
    await createGoal(page, { name: 'Old course', daily: '15', start: '2026-01-01', end: '2026-06-30' });
    await expect(page.getByTestId('goal-row')).toHaveCount(5);
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Marathon prep' })).toContainText('Upcoming');
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Old course' })).toContainText('Ended');
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Spanish' })).toContainText('Active');
    await page.goto(`${ORIGIN}/#/today`);
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(card(page, 'Spanish').locator('.amount')).toContainText('0/17');
    await expect(card(page, 'Read').locator('.amount')).toContainText('0/30');
    await expect(page.getByRole('article', { name: 'Marathon prep' })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Old course' })).toHaveCount(0);
  });

  test('AC6/AC7: +1% at target, edit and delete update totals without reload; day limit; invalid minutes', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', daily: '30' });
    await page.goto(`${ORIGIN}/#/today`);
    await page.evaluate(() => ((window as unknown as { __nr: boolean }).__nr = true));
    await log(page, 'Read', '20', 'Ch. 3');
    await expect(card(page, 'Read').locator('.amount')).toContainText('20/30');
    await expect(card(page, 'Read').getByText('+1%')).toHaveCount(0);
    await log(page, 'Read', '10');
    await expect(card(page, 'Read').locator('.amount')).toContainText('30/30');
    await expect(card(page, 'Read').getByText('+1%')).toBeVisible();
    await card(page, 'Read').getByRole('button', { name: 'Edit entry: 20 min, Ch. 3' }).click();
    await card(page, 'Read').getByLabel(/^Minutes/).fill('5');
    await card(page, 'Read').getByRole('button', { name: 'Save changes' }).click();
    await expect(card(page, 'Read').locator('.amount')).toContainText('15/30');
    await expect(card(page, 'Read').getByText('+1%')).toHaveCount(0);
    await card(page, 'Read').getByRole('button', { name: 'Delete entry: 5 min, Ch. 3' }).click();
    await card(page, 'Read').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card(page, 'Read').locator('.amount')).toContainText('10/30');
    expect(await page.evaluate(() => (window as unknown as { __nr: boolean }).__nr)).toBe(true);

    // invalid minutes
    for (const bad of ['0', '1441', '12.5', '', 'abc', '-3', '1e2x']) {
      await card(page, 'Read').getByRole('button', { name: 'Log time' }).click();
      await card(page, 'Read').getByLabel(/^Minutes/).fill(bad);
      await card(page, 'Read').getByRole('button', { name: 'Save entry' }).click();
      await expect(card(page, 'Read').locator('[aria-invalid="true"]'), `minutes "${bad}"`).toBeVisible();
      await expect(card(page, 'Read').locator('.amount')).toContainText('10/30');
      await page.keyboard.press('Escape');
    }
    // note too long (281)
    await card(page, 'Read').getByRole('button', { name: 'Log time' }).click();
    await card(page, 'Read').getByLabel(/^Minutes/).fill('1');
    await card(page, 'Read').getByLabel(/^Note/).fill('z'.repeat(281));
    await card(page, 'Read').getByRole('button', { name: 'Save entry' }).click();
    await expect(card(page, 'Read').getByLabel(/^Note/)).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');

    // day limit: 10 + 1390 = 1400; +41 rejected, +40 accepted
    await log(page, 'Read', '1390');
    await expect(card(page, 'Read').locator('.amount')).toContainText('1,400/30');
    await log(page, 'Read', '41');
    await expect(card(page, 'Read').locator('[aria-invalid="true"]')).toBeVisible();
    await card(page, 'Read').getByLabel(/^Minutes/).fill('40');
    await card(page, 'Read').getByRole('button', { name: 'Save entry' }).click();
    await expect(card(page, 'Read').locator('.amount')).toContainText('1,440/30');
    // editing an entry up beyond the limit is rejected, excluding itself is OK
    await card(page, 'Read').getByRole('button', { name: /^Edit entry: 40 min/ }).click();
    await card(page, 'Read').getByLabel(/^Minutes/).fill('41');
    await card(page, 'Read').getByRole('button', { name: 'Save changes' }).click();
    await expect(card(page, 'Read').locator('[aria-invalid="true"]')).toBeVisible();
    await card(page, 'Read').getByLabel(/^Minutes/).fill('40');
    await card(page, 'Read').getByRole('button', { name: 'Save changes' }).click();
    await expect(card(page, 'Read').locator('.amount')).toContainText('1,440/30');
  });

  test('AC8: editing the period so it excludes an entry is refused; other edits save', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', daily: '30', start: '2026-10-01', end: '2026-10-31' });
    await page.goto(`${ORIGIN}/#/today`);
    await log(page, 'Read', '15');
    // move the only entry date can't be set via UI (today only); so exclude today: end date before today
    await page.goto(`${ORIGIN}/#/goals`);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel(/^Start date/).fill('2026-10-10');
    await page.getByLabel(/^End date/).fill('2026-10-31');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit goal' })).toBeVisible();
    await expect(page.getByLabel(/^Start date/)).toHaveAttribute('aria-invalid', 'true');
    // restore start, change name → saves
    await page.getByLabel(/^Start date/).fill('2026-10-01');
    await page.getByLabel(/^Name/).fill('Read more');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
    await expect(page.getByTestId('goal-row')).toContainText('Read more');
  });

  test('AC9: delete with Cancel and Esc keeps the goal; Confirm removes goal and its entries', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', daily: '30' });
    await page.goto(`${ORIGIN}/#/today`);
    await log(page, 'Read', '15', 'note');
    await page.goto(`${ORIGIN}/#/goals`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('1 entry');
    await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('goal-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('goal-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete goal' }).click();
    await expect(page.getByTestId('goal-row')).toHaveCount(0);
    await page.goto(`${ORIGIN}/#/today`);
    await expect(page.getByRole('heading', { name: 'Start with one small goal' })).toBeVisible();
    const remaining = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('one-percent-better');
          req.onsuccess = () => {
            const c = req.result.transaction('entries').objectStore('entries').count();
            c.onsuccess = () => resolve(c.result);
          };
        }),
    );
    expect(remaining).toBe(0);
  });

  test('day rollover: Today and entries follow the new local date after midnight without reload', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-09T23:58:00+07:00') });
    await page.goto(`${ORIGIN}/#/goals/new`);
    await page.getByLabel(/^Name/).fill('Read');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await page.goto(`${ORIGIN}/#/today`);
    await expect(page.getByText('Friday, October 9')).toBeVisible();
    await log(page, 'Read', '10');
    await expect(card(page, 'Read').locator('.amount')).toContainText('10/30');
    await page.clock.fastForward('00:03:00');
    await page.clock.runFor(61_000);
    await expect(page.getByText('Saturday, October 10')).toBeVisible();
    await expect(card(page, 'Read').locator('.amount')).toContainText('0/30');
  });
});

test.describe('M1 QC delete dialog at 360 px with a long goal name', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('dialog fits the viewport', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'W'.repeat(60), daily: '30' });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  });

  test('DEFECT PROBE: Goals list with a normal-length "why" (100 chars) has no horizontal scroll', async ({ page }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter and read more books every day. '.repeat(3).slice(0, 100), daily: '30' });
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, `scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw);
  });
});


test.describe('M1 QC cross-tab and desktop', () => {
  test('a second tab sees entries logged in the first without reload', async ({ page, context }) => {
    await boot(page);
    await createGoal(page, { name: 'Read', daily: '30' });
    await page.goto(`${ORIGIN}/#/today`);
    const p2 = await context.newPage();
    await p2.clock.setFixedTime(new Date('2026-10-09T10:00:00+07:00'));
    await p2.goto(`${ORIGIN}/#/today`);
    await expect(card(p2, 'Read').locator('.amount')).toContainText('0/30');
    await log(page, 'Read', '12');
    await expect(card(p2, 'Read').locator('.amount')).toContainText('12/30');
  });

  test.describe('1440 px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('no horizontal scroll on every M1 screen with long text present', async ({ page }) => {
      await boot(page);
      await createGoal(page, { name: 'W'.repeat(60), why: 'Be smarter and read more books. '.repeat(8).slice(0, 280), daily: '30' });
      for (const hash of ['/today', '/goals', '/goals/new', '/settings', '/abc']) {
        await page.goto(`${ORIGIN}/#${hash}`);
        await page.waitForTimeout(200);
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(sw, `${hash}`).toBeLessThanOrEqual(cw);
      }
    });
  });
});

test.describe('M1 QC vi-VN', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });
  test('AC15/17/18: Vietnamese by default, formats, no English leaks, axe, no horizontal scroll', async ({ page }) => {
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.today.title);
    expect(await viScan(page)).toEqual([]);
    await page.goto(`${ORIGIN}/#/goals/new`);
    await page.getByRole('button', { name: vi.goal.form.save }).click();
    await expect(page.getByText(vi.errors.GOAL_NAME_REQUIRED)).toBeVisible();
    expect(await viScan(page)).toEqual([]);
    await page.getByLabel(new RegExp(`^${vi.goal.form.nameLabel}`)).fill('Read');
    await page.getByRole('textbox', { name: new RegExp(`^${vi.goal.form.targetDaily}`) }).fill('30');
    await page.getByLabel(new RegExp(`^${vi.goal.form.startLabel}`)).fill('2026-10-01');
    await page.getByRole('radio', { name: vi.goal.form.endsSpecific }).check();
    await page.getByLabel(new RegExp(`^${vi.goal.form.endLabel}`)).fill('2026-10-31');
    await expect(page.locator('.hint').first()).toContainText('930');
    await expect(page.locator('.hint').first()).toContainText('15,5');
    await page.getByRole('button', { name: vi.goal.form.save }).click();
    await expect(page.getByTestId('goal-row')).toContainText('01/10/2026 – 31/10/2026');
    expect(await viScan(page)).toEqual([]);
    await page.goto(`${ORIGIN}/#/today`);
    await expect(page.getByText(/9 tháng 10/)).toBeVisible();
    expect(await viScan(page)).toEqual([]);
    for (const hash of ['/today', '/goals', '/goals/new', '/settings', '/abc']) {
      await page.goto(`${ORIGIN}/#${hash}`);
      await page.waitForTimeout(250);
      expect(await viScan(page), hash).toEqual([]);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), hash).toEqual([]);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `${hash} scrollWidth`).toBeLessThanOrEqual(cw);
    }
    // switch to English: formats flip immediately
    await page.goto(`${ORIGIN}/#/settings`);
    await page.getByRole('radio', { name: 'English' }).check();
    await page.goto(`${ORIGIN}/#/goals`);
    await expect(page.getByTestId('goal-row')).toContainText('2026-10-01 – 2026-10-31');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
