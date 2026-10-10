// QC round 1 (M5): whole-app sweep. For every screen and state, in en and vi, light and dark: axe (serious/critical = 0),
// vi leak scan, no horizontal scroll at 360 / 768 / 1440 px, no console errors, no request outside the origin.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, freezeClock, gotoHash, VI } from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) problems.push(`external request: ${u}`);
  });
  return problems;
}

type Rec = Record<string, unknown>;
async function sweepData(): Promise<{ goals: Rec[]; entries: Rec[]; settings: Rec; [k: string]: unknown }> {
  const base = JSON.parse(await readFile(fixturePath('sample-backup.json'), 'utf8')) as { goals: Rec[]; entries: Rec[]; settings: Rec };
  const goals = base.goals.map((g) => (g.id === 'g3' ? { ...g, archived: true, updatedAt: '2026-10-05T01:00:00.000Z' } : g));
  goals.push({ ...base.goals[0], id: 'e1', name: 'Supercalifragilisticexpialidocious-goal-name-1234567890', why: 'because', createdAt: '2026-10-08T01:00:00.000Z', updatedAt: '2026-10-08T01:00:00.000Z' });
  return { ...base, goals };
}

const SCREENS: Array<[string, string]> = [
  ['today', '/today'],
  ['goals', '/goals'],
  ['goal-new', '/goals/new'],
  ['goal-edit', '/goals/g1/edit'],
  ['detail-full', '/goals/g1'],
  ['detail-upcoming', '/goals/g4'],
  ['detail-ended', '/goals/g5'],
  ['detail-archived', '/goals/g3'],
  ['detail-empty-long-name', '/goals/e1'],
  ['review', '/review'],
  ['review-archived', '/review?goal=g3&year=2026'],
  ['day', '/day/2026-10-08'],
  ['day-future', '/day/2026-10-10'],
  ['settings', '/settings'],
  ['not-found', '/nope'],
  ['goal-not-found', '/goals/zzz'],
];

for (const lang of ['en', 'vi'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`sweep ${lang}/${scheme}: axe clean + no horizontal scroll at 360, 768, 1440 on ${SCREENS.length} screens`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ locale: lang === 'vi' ? 'vi-VN' : 'en-US', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: scheme, viewport: { width: 360, height: 800 }, baseURL: ORIGIN });
      const page = await ctx.newPage();
      await freezeClock(page);
      const problems = watch(page);
      await gotoHash(page, '/settings');
      await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(await sweepData()), 'utf8') });
      const copy = lang === 'vi' ? VI : EN;
      await page.getByRole('dialog').getByRole('button', { name: copy.import.confirm }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      for (const [label, hash] of SCREENS) {
        for (const width of [360, 768, 1440]) {
          await page.setViewportSize({ width, height: 800 });
          await gotoHash(page, hash);
          await expect(page.getByRole('heading', { level: 1 }), `${label} ${width}`).toBeVisible();
          if (hash.startsWith('/goals/g') && !hash.includes('edit')) await expect(page.getByTestId('headline')).toBeVisible();
          if (hash.startsWith('/review')) await expect(page.getByTestId('heatmap')).toBeVisible();
          await page.waitForTimeout(50);
          await expectNoHorizontalScroll(page).catch((e: Error) => {
            throw new Error(`${lang}/${scheme} ${label} @${width}: ${e.message}`);
          });
          if (width !== 768) await expectAxeClean(page).catch((e: Error) => {
            throw new Error(`${lang}/${scheme} ${label} @${width}: ${e.message}`);
          });
          if (lang === 'vi' && width === 360) await expectNoViLeaks(page);
        }
      }
      expect(problems).toEqual([]);
      await ctx.close();
    });
  }
}

test('dialogs and transient UI in vi/dark: D2 delete, D3 import, Stop dialog, entry form errors, goal form errors, toast - axe clean and no vi leaks', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'dark', viewport: { width: 360, height: 800 }, baseURL: ORIGIN });
  const page = await ctx.newPage();
  await freezeClock(page);
  const problems = watch(page);
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(await sweepData()), 'utf8') });
  const d3 = page.getByRole('dialog');
  await expect(d3).toBeVisible();
  await expectAxeClean(page);
  await expectNoViLeaks(page);
  await d3.getByRole('button', { name: VI.import.confirm }).click();
  await expect(d3).toBeHidden();
  await expectNoViLeaks(page); // toast visible
  await gotoHash(page, '/goals');
  await page.getByTestId('goal-row').first().getByRole('button', { name: VI.common.delete }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAxeClean(page);
  await expectNoViLeaks(page);
  await page.keyboard.press('Escape');
  // goal form validation errors
  await gotoHash(page, '/goals/new');
  await page.getByRole('button', { name: VI.goal.form.save }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expectAxeClean(page);
  await expectNoViLeaks(page);
  // entry form errors on Today
  await gotoHash(page, '/today');
  const card = page.getByRole('article').first();
  await card.getByRole('button', { name: VI.goalCard.logTime }).click();
  await card.getByLabel(/^Số phút/).fill('0');
  await card.getByRole('button', { name: VI.entry.form.save }).click();
  await expectAxeClean(page);
  await expectNoViLeaks(page);
  expect(problems).toEqual([]);
  await ctx.close();
});
