// QC M6 round 1 — identity rendering, a11y (light/dark, en/vi), layout, privacy page (project `cloud`).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, CLOUD_BASE_URL, FIXED_MS, signInViaMock, signOutDialog } from '../../../e2e/cloud/helpers';
import { at, EN, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, toast, VI } from '../../../e2e/helpers/app';

/** serious/critical axe violations as readable strings. */
export async function axeAll(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Put a hand-made SDK session in localStorage (far-future expiry, no network needed). Call on an app page, then reload. */
export async function forgeSession(page: Page, user: { email: string; full_name?: string; name?: string }): Promise<void> {
  await page.evaluate((u) => {
    const meta: Record<string, string> = {};
    if (u.full_name !== undefined) meta.full_name = u.full_name;
    if (u.name !== undefined) meta.name = u.name;
    localStorage.setItem(
      'opb-auth',
      JSON.stringify({
        access_token: 'forged.access.token',
        refresh_token: 'forged-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        user: { id: '00000000-0000-4000-8000-0000000000aa', aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'google' }, user_metadata: meta, created_at: '2026-10-01T00:00:00Z' },
      }),
    );
  }, user);
}

/** Per-worker User-Agent so the mock keeps this browser context in the worker's partition (e2e/cloud/fixtures.ts). */
export function workerUserAgent(workerIndex: number): string {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36 opb-e2e-w${workerIndex}-${process.pid}`;
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

const identities: Array<{ label: string; user: { email: string; full_name?: string; name?: string }; initial: string }> = [
  { label: 'long name + 44-char email', user: { email: 'nguyen.thi.hong.nhung.phuong.2026@gmail.com', full_name: 'Nguyễn Thị Hồng Nhung Phương' }, initial: 'N' },
  { label: 'emoji first grapheme', user: { email: 'smile@example.com', full_name: '😀 Smile' }, initial: '😀' },
  { label: 'no name uses email local part', user: { email: 'jane.doe@example.com' }, initial: 'J' },
  { label: 'HTML in name is escaped', user: { email: 'x@example.com', full_name: '<img src=x onerror="window.__xss=1"><b>B</b>' }, initial: '<' },
  { label: 'very long unbroken name', user: { email: 'long@example.com', full_name: 'A'.repeat(120) }, initial: 'A' },
];

test.describe('M6-AC11 extra: identity rendering at 360 px', () => {
  for (const id of identities) {
    for (const loc of ['en-US', 'vi-VN'] as const) {
      test(`${id.label} @360 ${loc}: no horizontal scroll, axe clean, escaped`, async ({ browser }, testInfo) => {
        const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: loc, timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: workerUserAgent(testInfo.workerIndex) });
        const page = await ctx.newPage();
        await freezeClock(page);
        await page.goto('#/settings');
        await forgeSession(page, id.user);
        await page.reload();
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
        expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
        await expect(page.locator('img[src="x"]')).toHaveCount(0);
        await expectNoHorizontalScroll(page);
        expect(await axeAll(page)).toEqual([]);
        const initial = await accountCard(page).getByTestId('avatar').textContent();
        expect(initial?.trim()).toBe(id.initial);
        const box = await accountCard(page).boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${id.label.replace(/\W+/g, '-')}-${loc}.png`), fullPage: true });
        await ctx.close();
      });
    }
  }
});

test.describe('M6-AC11 extra: axe light/dark x en/vi through the whole Account journey', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const loc of ['en-US', 'vi-VN'] as const) {
      test(`${scheme}/${loc}: A1, A4 alert, A5, D4 keep+remove, A10`, async ({ browser, mock }, testInfo) => {
        test.setTimeout(120_000);
        const copy = loc === 'vi-VN' ? VI : EN;
        const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: loc, colorScheme: scheme, timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: workerUserAgent(testInfo.workerIndex) });
        const page = await ctx.newPage();
        await freezeClock(page);
        await gotoHash(page, '/settings');
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
        expect(await axeAll(page), 'A1').toEqual([]);
        if (loc === 'vi-VN') await expectNoViLeaks(page);
        await signInViaMock(page, 'Cancel', copy);
        await expect(accountCard(page).getByRole('alert')).toBeVisible();
        expect(await axeAll(page), 'A4').toEqual([]);
        await signInViaMock(page, 'Minh Test', copy);
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
        expect(await axeAll(page), 'A5').toEqual([]);
        if (loc === 'vi-VN') await expectNoViLeaks(page);
        await accountCard(page).getByRole('button', { name: copy.settings.account.signOut }).click();
        expect(await axeAll(page), 'D4 keep').toEqual([]);
        await signOutDialog(page).getByRole('radio', { name: copy.auth.signOut.remove }).check();
        expect(await axeAll(page), 'D4 remove').toEqual([]);
        if (loc === 'vi-VN') await expectNoViLeaks(page);
        await page.screenshot({ path: testInfo.outputPath(`d4-remove-${scheme}-${loc}.png`) });
        await page.keyboard.press('Escape');
        await accountCard(page).getByRole('button', { name: copy.settings.account.signOut }).click();
        await page.getByTestId('signout-confirm').click();
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
        await mock.session({ ttl: 5, refresh: 'invalid_grant', now: FIXED_MS });
        await signInViaMock(page, 'Minh Test', copy);
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
        await freezeClock(page, at('00:10:00'));
        await page.reload();
        await expect(accountCard(page)).toHaveAttribute('data-state', 'expired', { timeout: 20_000 });
        expect(await axeAll(page), 'A10').toEqual([]);
        if (loc === 'vi-VN') await expectNoViLeaks(page);
        await page.screenshot({ path: testInfo.outputPath(`a10-${scheme}-${loc}.png`), fullPage: true });
        await ctx.close();
      });
    }
  }

  test('error toast (callback error landing on Today) in dark: axe clean', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: 'dark', locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: workerUserAgent(testInfo.workerIndex) });
    const page = await ctx.newPage();
    await freezeClock(page);
    await page.addInitScript(() => {
      if (location.search.includes('auth=callback')) sessionStorage.setItem('opb-auth-return', '#/today');
    });
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&error=server_error&error_description=boom`);
    await expect(toast(page)).toHaveAttribute('data-tone', 'error');
    expect(await axeAll(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('error-toast-dark.png') });
    await ctx.close();
  });
});

test.describe('M6-AC11 extra: layout', () => {
  for (const vp of [
    { w: 360, h: 740 },
    { w: 1440, h: 900 },
    { w: 640, h: 360 },
  ]) {
    test(`D4 fits the viewport ${vp.w}x${vp.h}: dialog inside viewport, confirm reachable and >= 44 px, no h-scroll`, async ({ browser }, testInfo) => {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: workerUserAgent(testInfo.workerIndex) });
      const page = await ctx.newPage();
      await freezeClock(page);
      await page.goto('#/settings');
      await forgeSession(page, { email: 'nguyen.thi.hong.nhung.phuong.2026@gmail.com', full_name: 'Nguyễn Thị Hồng Nhung Phương' });
      await page.reload();
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
      await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
      const d = signOutDialog(page);
      await expect(d).toBeVisible();
      await d.getByRole('radio', { name: VI.auth.signOut.remove }).check();
      const box = await d.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.w + 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.h + 0.5);
      const confirm = page.getByTestId('signout-confirm');
      await expect(confirm).toBeInViewport();
      expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`d4-${vp.w}x${vp.h}.png`) });
      await ctx.close();
    });
  }

  for (const vp of [
    { w: 360, h: 740 },
    { w: 768, h: 900 },
    { w: 1440, h: 900 },
  ]) {
    test(`Settings card order, tap sizes, no h-scroll at ${vp.w}px (signed-out, signed-in)`, async ({ browser }, testInfo) => {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: workerUserAgent(testInfo.workerIndex) });
      const page = await ctx.newPage();
      await freezeClock(page);
      await page.goto('#/settings');
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
      expect(await page.locator('main section.card > h2').allTextContents()).toEqual([EN.settings.language.title, EN.settings.account.title, EN.settings.reminders.title, EN.settings.backup.title, EN.settings.storage.title, EN.settings.about.title]);
      await expectNoHorizontalScroll(page);
      const googleBtn = await accountCard(page).getByRole('button', { name: EN.auth.signInGoogle }).boundingBox();
      expect(googleBtn!.height).toBeGreaterThanOrEqual(43.5);
      await page.screenshot({ path: testInfo.outputPath(`signed-out-${vp.w}.png`), fullPage: true });
      await forgeSession(page, { email: 'minh.test@example.com', full_name: 'Minh Test' });
      await page.reload();
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
      const so = await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).boundingBox();
      expect(so!.height).toBeGreaterThanOrEqual(43.5);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`signed-in-${vp.w}.png`), fullPage: true });
      await ctx.close();
    });
  }
});

test.describe('FR-43 / NFR-16 privacy page', () => {
  test('About links to privacy.html; bilingual; reachable offline from the SW precache; axe clean light+dark; no h-scroll at 360', async ({ page, context, browser }, testInfo) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const link = page.getByTestId('privacy-link');
    await expect(link).toHaveText(EN.settings.about.privacyLink);
    expect(new URL((await link.getAttribute('href'))!, page.url()).href).toBe(`${CLOUD_BASE_URL}privacy.html`);
    const res = await page.request.get(`${CLOUD_BASE_URL}privacy.html`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Privacy policy');
    expect(html).toContain('Chính sách quyền riêng tư');
    expect(html).not.toMatch(/<script/i);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.goto(`${CLOUD_BASE_URL}privacy.html`);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư' })).toBeVisible();
    await page.locator('a.brand').click();
    await expect(page.locator('main h1')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/one-percent-better/');
    await context.setOffline(false);

    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme });
      const p = await ctx.newPage();
      await p.goto(`${CLOUD_BASE_URL}privacy.html`);
      expect(await axeAll(p), `axe ${scheme}`).toEqual([]);
      await expectNoHorizontalScroll(p);
      await p.screenshot({ path: testInfo.outputPath(`privacy-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  });
});
