// `npm run store:screenshots` (TASKS M15-T5, M15-AC9; DESIGN v5.0 7.8.8; ADR-43): the five App Store screenshots per
// locale, rendered from the native build in Chromium (playwright.store.config.ts: 440 × 956 @3x, Asia/Ho_Chi_Minh).
// Fixed clock 2026-10-09 19:30 (+07:00), demo dataset imported through the real Import flow, iPhone 16 Pro Max safe
// areas emulated (--safe-top 62 px, --safe-bottom 34 px), reminders off, "Last backup" 2026-10-05. Output:
// store/ios/screenshots/{en-US,vi}/0N-<screen>.jpg (1320 × 2868, JPEG quality 90, no device frame, no caption).
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EN, expectAmount, expectAxeClean, freezeClock, goalCard, scanVi, startTimer, timerElapsed, toast, VI } from '../e2e/helpers/app';
import { jpegInfo } from '../src/test/jpeg';

const CLOCK = new Date('2026-10-09T19:30:00+07:00');
const TIMER_CLOCK = new Date('2026-10-09T19:42:41+07:00');
const OUT = join(process.cwd(), 'store', 'ios', 'screenshots');
const FIXTURES = join(process.cwd(), 'store', 'fixtures');
const SIZE = { width: 1320, height: 2868 };

const SCREENS = [
  { file: '01-today.jpg', route: '/today', scheme: 'light' },
  { file: '02-timer.jpg', route: '/today', scheme: 'light' },
  { file: '03-curve.jpg', route: '/goals/demo-guitar', scheme: 'dark' },
  { file: '04-review.jpg', route: '/review', scheme: 'dark' },
  { file: '05-goals.jpg', route: '/goals', scheme: 'light' },
] as const;

async function emulateIphoneInsets(page: Page) {
  await page.addInitScript(() => {
    const apply = () => {
      document.documentElement.style.setProperty('--safe-top', '62px');
      document.documentElement.style.setProperty('--safe-bottom', '34px');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
  });
}

async function importDemo(page: Page, locale: 'en' | 'vi', copy: typeof EN | typeof VI) {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: copy.settings.title })).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(join(FIXTURES, `demo-${locale}.json`));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: copy.import.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText(copy.toast.backupImported.split(':')[0]);
  // The toast must not be in the pictures: wait for it to auto-hide (4 s).
  await expect(toast(page)).toHaveCount(0, { timeout: 15_000 });
}

async function shoot(page: Page, locale: 'en-US' | 'vi', file: string) {
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  // Settle: fonts, lazy chunks (Recharts), heatmap scroll.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path, type: 'jpeg', quality: 90, fullPage: false, animations: 'disabled', caret: 'hide' });
  const info = jpegInfo(new Uint8Array(readFileSync(path)));
  expect(info.jpeg, file).toBe(true);
  expect({ width: info.width, height: info.height }, file).toEqual(SIZE);
  expect(statSync(path).size, file).toBeLessThan(8 * 1024 * 1024);
}

for (const [locale, appLocale, copy] of [
  ['en-US', 'en', EN],
  ['vi', 'vi', VI],
] as const) {
  test.describe(`App Store screenshots ${locale}`, () => {
    test.use({ locale: locale === 'vi' ? 'vi-VN' : 'en-US' });

    test(`5 screens → store/ios/screenshots/${locale}/`, async ({ page }) => {
      test.setTimeout(240_000);
      await emulateIphoneInsets(page);
      await freezeClock(page, CLOCK);
      await importDemo(page, appLocale, copy);

      for (const screen of SCREENS) {
        await page.emulateMedia({ colorScheme: screen.scheme });
        if (screen.file === '02-timer.jpg') {
          await page.goto('/#/today');
          await startTimer(page, copy === EN ? 'Spanish' : 'Tiếng Tây Ban Nha', copy);
          await freezeClock(page, TIMER_CLOCK);
          await expect(timerElapsed(page)).toHaveText('00:12:41');
          // Starting the timer scrolled the page to the card; the picture shows the TimerCard at the top of the list.
          await page.evaluate(() => window.scrollTo(0, 0));
        } else {
          if (screen.file === '03-curve.jpg') await freezeClock(page, CLOCK); // the timer is gone with the next load
          await page.goto(`/#${screen.route}`);
        }
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        switch (screen.file) {
          case '01-today.jpg':
            await expectAmount(page, copy === EN ? 'Read' : 'Đọc sách', '30/30');
            await expectAmount(page, 'Guitar', '22/20');
            await expectAmount(page, copy === EN ? 'Spanish' : 'Tiếng Tây Ban Nha', '10/15');
            expect(await page.locator('[data-testid="backup-banner"], [data-testid="reminder-banner"]').count()).toBe(0);
            break;
          case '03-curve.jpg':
            await expect(page.getByRole('heading', { level: 1, name: 'Guitar' })).toBeVisible();
            await expect(page.getByText(copy === EN ? '+175.0% better' : 'Tốt hơn +175,0%')).toBeVisible();
            break;
          case '04-review.jpg':
            await expect(page.getByTestId('heatmap')).toBeVisible();
            break;
          case '05-goals.jpg':
            await expect(goalCard(page, 'Piano').or(page.getByText('Piano'))).toBeVisible();
            break;
          default:
            break;
        }
        if (locale === 'vi') expect(await scanVi(page), screen.file).toEqual([]);
        await expectAxeClean(page);
        await shoot(page, locale, screen.file);
      }
      // Only the demo data is on screen: nothing else was ever created in this context.
      const names = await page.evaluate(
        () =>
          new Promise<string[]>((resolve, reject) => {
            const req = indexedDB.open('one-percent-better');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const db = req.result;
              const get = db.transaction('goals', 'readonly').objectStore('goals').getAll();
              get.onsuccess = () => resolve((get.result as Array<{ name: string }>).map((g) => g.name).sort());
              get.onerror = () => reject(get.error);
            };
          }),
      );
      expect(names).toEqual((copy === EN ? ['Guitar', 'Piano', 'Read', 'Spanish', 'Stretch'] : ['Guitar', 'Giãn cơ', 'Piano', 'Tiếng Tây Ban Nha', 'Đọc sách']).sort());
    });
  });
}
