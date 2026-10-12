// QC round 2 (M1): verify fixes for M1-D1 (Goals overflow) and M1-D3 (strict number input), explore around them.
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';

async function boot(page: Page, hash = '/today') {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+07:00'));
  await page.goto(`${ORIGIN}/#${hash}`);
}

async function dbAll(page: Page, store: 'goals' | 'entries'): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    (s) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction(s).objectStore(s).getAll();
          r.onsuccess = () => resolve(r.result as Array<Record<string, unknown>>);
          r.onerror = () => reject(r.error);
        };
      }),
    store,
  );
}
const dbGoals = (page: Page) => dbAll(page, 'goals');
const dbEntries = (page: Page) => dbAll(page, 'entries');

const SENT = 'Be smarter and read more books every day. ';
const VI_SENT = 'Trở nên thông minh hơn và đọc nhiều sách mỗi ngày nhé. ';

async function addGoal(page: Page, c: { name: string; why: string; save: string }) {
  await page.goto(`${ORIGIN}/#/goals/new`);
  await page.getByLabel(/^(Name|Tên)/).fill(c.name);
  await page.getByLabel(/^(Why|Lý do)/).fill(c.why);
  await page.getByRole('textbox', { name: /^(Minutes per day|Phút mỗi ngày)/ }).fill('30');
  await page.getByRole('button', { name: c.save }).click();
  await expect(page).toHaveURL(/#\/goals$/);
}

async function widths(page: Page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
}

for (const [label, locale, sent, save, nameSeed] of [
  ['en', 'en-US', SENT, 'Save goal', 'Read a very long book name '],
  ['vi-VN', 'vi-VN', VI_SENT, 'Lưu mục tiêu', 'Đọc một cuốn sách có tên rất dài '],
] as const) {
  for (const width of [320, 360]) {
    test.describe(`R2 D1 ${label} ${width}px`, () => {
      test.use({ viewport: { width, height: 740 }, locale });
      test('Goals row: many why lengths, long names, no horizontal scroll, why is ellipsised, controls on screen', async ({ page }) => {
        await boot(page);
        for (const n of [20, 40, 55, 60, 80, 100, 280]) {
          await addGoal(page, { name: `${nameSeed}${n}`.slice(0, 60), why: sent.repeat(10).slice(0, n), save });
          const { sw, cw } = await widths(page);
          expect(sw, `why ${n}: scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw);
        }
        // unbroken tokens too
        await addGoal(page, { name: 'N'.repeat(60), why: 'w'.repeat(280), save });
        const { sw, cw } = await widths(page);
        expect(sw).toBeLessThanOrEqual(cw);
        const rows = page.getByTestId('goal-row');
        const count = await rows.count();
        expect(count).toBe(8);
        for (let i = 0; i < count; i++) {
          const box = await rows.nth(i).boundingBox();
          expect(box && box.x >= 0 && box.x + box.width <= cw, `row ${i} inside viewport ${JSON.stringify(box)}`).toBe(true);
          const ctrls = rows.nth(i).locator('a, button');
          const nCtrl = await ctrls.count();
          for (let j = 0; j < nCtrl; j++) {
            const b = await ctrls.nth(j).boundingBox();
            expect(b && b.x >= 0 && b.x + b.width <= cw, `row ${i} control ${j} ${JSON.stringify(b)}`).toBe(true);
          }
        }
        const trunc = await page.locator('.goal-row .why').evaluateAll((els) =>
          els.map((el) => ({ len: el.textContent?.length ?? 0, to: getComputedStyle(el).textOverflow, clipped: el.scrollWidth > el.clientWidth, inside: el.getBoundingClientRect().right <= document.documentElement.clientWidth })),
        );
        expect(trunc).toHaveLength(8);
        for (const t of trunc) {
          expect(t.to).toBe('ellipsis');
          expect(t.inside).toBe(true);
          if (t.len >= 60) expect(t.clipped, `why of ${t.len} chars should be truncated`).toBe(true);
        }
        for (const hash of ['/today', '/settings']) {
          await page.goto(`${ORIGIN}/#${hash}`);
          const w = await widths(page);
          expect(w.sw, hash).toBeLessThanOrEqual(w.cw);
        }
      });
    });
  }
}

test.describe('R2 D1 desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('1440px Goals with 280-char why: no scroll', async ({ page }) => {
    await boot(page);
    await addGoal(page, { name: 'Read', why: SENT.repeat(10).slice(0, 280), save: 'Save goal' });
    const w = await widths(page);
    expect(w.sw).toBeLessThanOrEqual(w.cw);
  });
});

test.describe('R2 D3 strict number input (goal form)', () => {
  const rejected = ['0x1E', '1e1', '0b11', '0o17', '٣٠', '+30', '-30', '30.', '.5', '1,000', '1_000', '３０', 'Infinity', 'NaN', '1e400', '30 min', '3 0'];
  const accepted: Array<[string, number]> = [['30', 30], [' 30 ', 30], ['30.0', 30], ['030', 30], ['1440', 1440]];

  for (const v of rejected) {
    test(`daily minutes ${JSON.stringify(v)} rejected`, async ({ page }) => {
      await boot(page, '/goals/new');
      await page.getByLabel(/^Name/).fill('T');
      const field = page.getByRole('textbox', { name: /^Minutes per day/ });
      await field.fill(v);
      await page.getByRole('button', { name: 'Save goal' }).click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(page).toHaveURL(/#\/goals\/new$/);
      expect(await dbGoals(page)).toHaveLength(0);
    });
  }
  for (const [v, n] of accepted) {
    test(`daily minutes ${JSON.stringify(v)} accepted as ${n}`, async ({ page }) => {
      await boot(page, '/goals/new');
      await page.getByLabel(/^Name/).fill('T');
      await page.getByRole('textbox', { name: /^Minutes per day/ }).fill(v);
      await page.getByRole('button', { name: 'Save goal' }).click();
      await expect(page).toHaveURL(/#\/goals$/);
      const g = await dbGoals(page);
      expect(g).toHaveLength(1);
      expect(g[0]!.targetMinutes).toBe(n);
    });
  }
  test('12.5 still rejected as non-integer', async ({ page }) => {
    await boot(page, '/goals/new');
    await page.getByLabel(/^Name/).fill('T');
    const field = page.getByRole('textbox', { name: /^Minutes per day/ });
    await field.fill('12.5');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(await dbGoals(page)).toHaveLength(0);
  });
  for (const v of ['0x1E', '1e1', '0b11', '+10']) {
    test(`total hours ${JSON.stringify(v)} rejected`, async ({ page }) => {
      await boot(page, '/goals/new');
      await page.getByLabel(/^Name/).fill('T');
      await page.getByRole('radio', { name: 'Total hours' }).check();
      await page.getByRole('radio', { name: 'On a specific date' }).check();
      await page.getByLabel(/^End date/).fill('2026-10-31');
      const field = page.getByRole('textbox', { name: /^Total hours/ });
      await field.fill(v);
      await page.getByRole('button', { name: 'Save goal' }).click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(await dbGoals(page)).toHaveLength(0);
    });
  }
  test('total hours " 10.0 " with end date accepted', async ({ page }) => {
    await boot(page, '/goals/new');
    await page.getByLabel(/^Name/).fill('T');
    await page.getByRole('radio', { name: 'Total hours' }).check();
    await page.getByRole('radio', { name: 'On a specific date' }).check();
    await page.getByLabel(/^End date/).fill('2026-10-31');
    await page.getByRole('textbox', { name: /^Total hours/ }).fill(' 10.0 ');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    expect(await dbGoals(page)).toHaveLength(1);
  });
  test('vi-VN: rejected value is flagged in the Vietnamese UI', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
    const page = await ctx.newPage();
    await boot(page, '/goals/new');
    await page.getByLabel(/^Tên/).fill('T');
    const field = page.getByRole('textbox', { name: /^Phút mỗi ngày/ });
    await field.fill('0x1E');
    await page.getByRole('button', { name: 'Lưu mục tiêu' }).click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(await dbGoals(page)).toHaveLength(0);
    await ctx.close();
  });
});

test.describe('R2 D3 strict number input (entry form)', () => {
  async function withGoal(page: Page) {
    await boot(page, '/goals/new');
    await page.getByLabel(/^Name/).fill('Read');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByRole('button', { name: 'Save goal' }).click();
    // Wait for the save to finish (the form navigates to Goals afterwards); going to Today first raced under load (M7 round 1 flake).
    await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
    await page.goto(`${ORIGIN}/#/today`);
  }
  for (const v of ['0x1E', '1e1', '0b11', '+10', '٣٠', '10.', '1,0', '-5', '0', '1441', '12.5', '']) {
    test(`entry minutes ${JSON.stringify(v)} rejected`, async ({ page }) => {
      await withGoal(page);
      await page.getByRole('button', { name: 'Log time' }).click();
      const f = page.getByLabel(/^Minutes/);
      await f.fill(v);
      await page.getByRole('button', { name: 'Save entry' }).click();
      await expect(f).toHaveAttribute('aria-invalid', 'true');
      expect(await dbEntries(page)).toHaveLength(0);
    });
  }
  for (const [v, n] of [['10', 10], [' 10 ', 10], ['10.0', 10], ['010', 10]] as Array<[string, number]>) {
    test(`entry minutes ${JSON.stringify(v)} accepted as ${n}`, async ({ page }) => {
      await withGoal(page);
      await page.getByRole('button', { name: 'Log time' }).click();
      await page.getByLabel(/^Minutes/).fill(v);
      await page.getByRole('button', { name: 'Save entry' }).click();
      await expect.poll(async () => (await dbEntries(page)).length).toBe(1);
      expect((await dbEntries(page))[0]!.minutes).toBe(n);
    });
  }
});

test.describe('R2 D3 edit goal form', () => {
  test('editing an existing goal with 0x1E is rejected and the goal is unchanged', async ({ page }) => {
    await boot(page, '/goals/new');
    await page.getByLabel(/^Name/).fill('T');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    const [g] = await dbGoals(page);
    await page.goto(`${ORIGIN}/#/goals/${String(g!.id)}/edit`);
    const field = page.getByRole('textbox', { name: /^Minutes per day/ });
    await field.fill('0x1E');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(JSON.stringify((await dbGoals(page))[0])).toBe(JSON.stringify(g));
  });
});
