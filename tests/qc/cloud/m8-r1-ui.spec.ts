// QC M8 round 1 - copy by account state (cloud on / signed out / signed in / expired) in en and vi, ExportSignInHint
// edge cases (offline, two tabs, expired), banner/hint accessibility and layout in light/dark x en/vi x 360/1440,
// keyboard order and the busy state of the banner button. Mock Supabase, no real Google.
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, collectErrors, FIXED_MS, signInViaMock } from '../../../e2e/cloud/helpers';
import { at, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME, freezeClock, gotoHash, importBackup, kvGet, VI } from '../../../e2e/helpers/app';

const banner = (page: Page) => page.getByTestId('login-prompt-banner');
const hint = (page: Page) => page.getByTestId('export-sign-in-hint');

type Copy = typeof EN;

async function notProtected(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator.storage), 'persist', { configurable: true, writable: true, value: async () => false });
  });
}

async function exportClick(page: Page, copy: Copy): Promise<void> {
  await page.getByRole('button', { name: copy.settings.backup.export }).click();
}

async function exportBackup(page: Page, copy: Copy): Promise<void> {
  const download = page.waitForEvent('download');
  await exportClick(page, copy);
  await download;
  await expect(page.getByTestId('toast')).toHaveText(copy.toast.backupExported);
}

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

for (const loc of ['en-US', 'vi-VN'] as const) {
  const copy: Copy = loc === 'vi-VN' ? (VI as unknown as Copy) : EN;
  test.describe(`QC M8-AC4 copy by account state (${loc})`, () => {
    test.use({ locale: loc });

    test('signed out -> signed in -> expired: Backup / Storage / About copy, the Storage shortcut, no prompts when expired', async ({ page, mock }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await notProtected(page);
      await page.goto('#/settings');
      await importBackup(page, 'sample-backup.json', copy);
      await gotoHash(page, '/settings');
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');

      // --- cloud on, signed out
      await expect(page.getByTestId('backup-desc')).toHaveText(copy.settings.backup.descSignedOut);
      await expect(page.getByTestId('import-hint')).toHaveText(copy.settings.backup.importHint);
      await expect(page.getByText(copy.settings.about.descCloud, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.settings.about.privacy, { exact: true })).toBeVisible();
      await expect(page.getByTestId('storage-desc')).toHaveText(`${copy.settings.storage.notProtectedDesc} ${copy.settings.storage.notProtectedSignIn}`);
      await expect(accountCard(page).getByText(copy.settings.account.descSignedOut)).toBeVisible();
      await expect(accountCard(page).getByRole('button', { name: copy.loginPrompt.notNow })).toHaveCount(0);
      if (loc === 'vi-VN') await expectNoViLeaks(page);
      await expectAxeClean(page);
      // Storage shortcut: scroll + focus on the Google button, route unchanged
      const before = page.url();
      await page.getByTestId('storage-go-to-account').click();
      await expect(accountCard(page).getByRole('button', { name: copy.auth.signInGoogle })).toBeFocused();
      expect(page.url()).toBe(before);
      const box = await accountCard(page).getByRole('button', { name: copy.auth.signInGoogle }).boundingBox();
      const vp = page.viewportSize()!;
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);

      // --- signed in (session that will expire later)
      await mock.session({ ttl: 5, refresh: 'invalid_grant', now: FIXED_MS });
      await signInViaMock(page, 'Minh Test', copy);
      await gotoHash(page, '/settings');
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
      await expect(page.getByTestId('backup-desc')).toHaveText(copy.settings.backup.descSignedIn);
      await expect(page.getByTestId('import-hint')).toHaveText(copy.settings.backup.importHintSignedIn);
      await expect(page.getByText(copy.settings.about.descSignedIn, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.settings.about.descCloud, { exact: true })).toHaveCount(0);
      await expect(page.getByTestId('storage-desc')).toHaveText(copy.settings.storage.notProtectedDesc);
      await expect(page.getByTestId('storage-go-to-account')).toHaveCount(0);
      if (loc === 'vi-VN') await expectNoViLeaks(page);

      // --- expired: counts as "signed out" for these cards (A-D27) but never shows the prompts
      await freezeClock(page, at('00:10:00'));
      await page.reload();
      await expect(accountCard(page)).toHaveAttribute('data-state', 'expired', { timeout: 20_000 });
      await expect(page.getByTestId('backup-desc')).toHaveText(copy.settings.backup.descSignedOut);
      await expect(page.getByText(copy.settings.about.descCloud, { exact: true })).toBeVisible();
      await expect(page.getByTestId('storage-desc')).toHaveText(`${copy.settings.storage.notProtectedDesc} ${copy.settings.storage.notProtectedSignIn}`);
      if (loc === 'vi-VN') await expectNoViLeaks(page);
      await exportBackup(page, copy);
      await expect(hint(page)).toHaveCount(0);
      expect(await kvGet(page, 'loginPrompt')).toBeNull();
      await gotoHash(page, '/today');
      await expect(page.getByRole('heading', { level: 1, name: copy.today.title })).toBeVisible();
      await expect(banner(page)).toHaveCount(0);
      expect(errors.list).toEqual([]);
    });

    test('banner and hint text are DESIGN 7.7.4 verbatim, banner is a section named by loginPrompt.label', async ({ page }) => {
      await page.goto('#/settings');
      await importBackup(page, 'sample-backup.json', copy);
      await gotoHash(page, '/today');
      const b = banner(page);
      await expect(b).toBeVisible();
      await expect(b).toHaveAttribute('aria-label', copy.loginPrompt.label);
      await expect(b.locator('.title')).toHaveText(copy.loginPrompt.title);
      await expect(b.locator('p').nth(1)).toHaveText(copy.loginPrompt.body);
      await expect(b.getByRole('button', { name: copy.loginPrompt.notNow, exact: true })).toBeVisible();
      await expect(b.getByRole('button', { name: copy.auth.signInGoogle, exact: true })).toBeVisible();
      if (loc === 'vi-VN') await expectNoViLeaks(page);
      await b.getByRole('button', { name: copy.loginPrompt.notNow }).click();
      await expect(page.getByTestId('toast')).toHaveText(copy.loginPrompt.snoozedToast);
      await gotoHash(page, '/settings');
      await exportBackup(page, copy);
      await expect(hint(page)).toHaveAttribute('aria-label', copy.exportHint.label);
      await expect(hint(page)).toContainText(copy.exportHint.text);
      if (loc === 'vi-VN') await expectNoViLeaks(page);
    });
  });
}

test.describe('QC M8-AC3 edge cases of the Export hint', () => {
  test('an export while offline does not burn the 30-day slot; the next online export shows the hint', async ({ page, context }) => {
    await importBackup(page);
    await context.setOffline(true);
    await exportBackup(page, EN);
    await expect(hint(page)).toHaveCount(0);
    expect(await kvGet(page, 'loginPrompt')).toBeNull();
    await context.setOffline(false);
    await exportBackup(page, EN);
    await expect(hint(page)).toBeVisible();
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ lastExportHintAt: FIXED_TIME.toISOString() });
  });

  test('hint on screen, then the connection drops: button disabled with the reason; back online: enabled again', async ({ page, context }) => {
    await importBackup(page);
    await exportBackup(page, EN);
    await expect(hint(page)).toBeVisible();
    await context.setOffline(true);
    await expect(hint(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeDisabled();
    await expect(hint(page).getByTestId('export-hint-offline')).toHaveText(EN.settings.account.offlineHint);
    await context.setOffline(false);
    await expect(hint(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeEnabled();
    await expect(hint(page).getByTestId('export-hint-offline')).toHaveCount(0);
  });

  test('two tabs press Export in the same instant: exactly one hint is shown in total and the slot is stored once', async ({ page, context }) => {
    const errors = collectErrors(page);
    await importBackup(page);
    const b = await context.newPage();
    await b.goto('#/settings');
    await expect(b.getByRole('button', { name: EN.settings.backup.export })).toBeEnabled();
    const press = (p: Page) => p.evaluate((name) => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === name)?.click(), EN.settings.backup.export);
    await Promise.all([press(page), press(b)]);
    await expect(page.getByTestId('toast')).toHaveText(EN.toast.backupExported);
    await expect(b.getByTestId('toast')).toHaveText(EN.toast.backupExported);
    await page.waitForTimeout(800);
    const shown = (await hint(page).count()) + (await hint(b).count());
    expect(shown, 'one of the two tabs wins the atomic claim').toBe(1);
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ lastExportHintAt: FIXED_TIME.toISOString() });
    expect(errors.list).toEqual([]);
  });

  test('hint is not persistent UI: it is gone after leaving Settings and coming back, and does not return on the same day', async ({ page }) => {
    await importBackup(page);
    await exportBackup(page, EN);
    await expect(hint(page)).toBeVisible();
    await gotoHash(page, '/goals');
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('backup-desc')).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
  });

  test('Import never claims or shows the hint', async ({ page }) => {
    await importBackup(page);
    await expect(hint(page)).toHaveCount(0);
    expect(await kvGet(page, 'loginPrompt')).toBeNull();
  });
});

test.describe('QC M8-AC2 keyboard, focus and busy state', () => {
  test('Tab order: the banner buttons come right after the page header and before any goal control; Enter on "Not now" moves focus to the h1', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(banner(page)).toBeVisible();
    await page.getByRole('heading', { level: 1, name: EN.today.title }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return `${el?.closest('[data-testid="login-prompt-banner"]') ? 'banner' : el?.closest('article') ? 'goal' : 'other'}:${el?.textContent?.trim().slice(0, 30) ?? ''}`;
        }),
      );
    }
    console.log(`QC tab order: ${JSON.stringify(seen)}`);
    expect(seen.map((x) => x.split(':')[0])).toEqual(['banner', 'banner', 'goal']);
    await banner(page).getByRole('button', { name: EN.loginPrompt.notNow }).focus();
    await page.keyboard.press('Enter');
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeFocused();
    await expect(page.getByTestId('toast')).toHaveText(EN.loginPrompt.snoozedToast);
  });

  test('clicking Google on the banner: the banner stays (busy, Not now disabled) while the redirect is prepared, then lands on #/today signed in', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(banner(page)).toBeVisible();
    // Record every state of the banner (a MutationObserver, so even a very short busy phase is seen) in sessionStorage, which survives the redirect.
    await page.evaluate(() => {
      const log: string[] = [];
      const snap = () => {
        const bn = document.querySelector('[data-testid="login-prompt-banner"]');
        const g = bn?.querySelector('[data-testid="google-sign-in"]') as HTMLButtonElement | null;
        const n = bn?.querySelector('[data-testid="login-prompt-not-now"]') as HTMLButtonElement | null;
        const line = bn ? `${g?.textContent?.trim()}|g.disabled=${g?.disabled}|notNow.disabled=${n?.disabled}` : 'no-banner';
        if (log[log.length - 1] !== line) {
          log.push(line);
          sessionStorage.setItem('qcprobe', JSON.stringify(log));
        }
      };
      new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      snap();
    });
    await banner(page).getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Minh Test', exact: true }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/one-percent-better') && !u.searchParams.has('code'));
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    expect(page.url().endsWith('#/today')).toBe(true);
    await expect(banner(page)).toHaveCount(0);
    expect(page.url()).not.toMatch(/code=|auth=/);
    const probe = JSON.parse((await page.evaluate(() => sessionStorage.getItem('qcprobe'))) ?? '[]') as string[];
    console.log(`QC banner states from click to redirect: ${JSON.stringify(probe)}`);
    expect(probe[0]).toBe(`${EN.auth.signInGoogle}|g.disabled=false|notNow.disabled=false`);
    expect(probe).toContain(`${EN.auth.signingIn}|g.disabled=true|notNow.disabled=true`);
    expect(probe).not.toContain('no-banner');
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const loc of ['en-US', 'vi-VN'] as const) {
    for (const width of [360, 1440] as const) {
      test.describe(`QC M8 layout/a11y ${scheme} ${loc} ${width}px`, () => {
        test.use({ locale: loc, colorScheme: scheme, viewport: { width, height: width === 360 ? 740 : 900 } });
        const copy: Copy = loc === 'vi-VN' ? (VI as unknown as Copy) : EN;

        test('Today with the banner and Settings with the hint: axe 0 serious/critical, no horizontal scroll, no untranslated text, buttons >= 44 px', async ({ page }, testInfo) => {
          test.setTimeout(90_000);
          await page.goto('#/settings');
          await importBackup(page, 'sample-backup.json', copy);
          await gotoHash(page, '/today');
          const b = banner(page);
          await expect(b).toBeVisible();
          await expectNoHorizontalScroll(page);
          await expectAxeClean(page);
          if (loc === 'vi-VN') await expectNoViLeaks(page);
          for (const btn of await b.getByRole('button').all()) {
            const box = (await btn.boundingBox())!;
            expect(box.height, 'banner button height').toBeGreaterThanOrEqual(44);
          }
          const bb = (await b.boundingBox())!;
          expect(bb.x).toBeGreaterThanOrEqual(0);
          expect(bb.x + bb.width).toBeLessThanOrEqual(width);
          await page.screenshot({ path: testInfo.outputPath(`today-${scheme}-${loc}-${width}.png`), fullPage: true });
          await gotoHash(page, '/settings');
          await exportBackup(page, copy);
          await expect(hint(page)).toBeVisible();
          await expectNoHorizontalScroll(page);
          await expectAxeClean(page);
          if (loc === 'vi-VN') await expectNoViLeaks(page);
          const hb = (await hint(page).boundingBox())!;
          expect(hb.x + hb.width).toBeLessThanOrEqual(width);
          const gbox = (await hint(page).getByRole('button').boundingBox())!;
          expect(gbox.height).toBeGreaterThanOrEqual(44);
          await page.screenshot({ path: testInfo.outputPath(`settings-hint-${scheme}-${loc}-${width}.png`), fullPage: true });
        });
      });
    }
  }
}
