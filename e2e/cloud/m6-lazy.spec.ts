import { expect, test } from './fixtures';
import { EN, freezeClock, gotoHash } from '../helpers/app';
import { CLOUD_BASE_URL, MOCK_SUPABASE_URL, recordRequests, SDK_CHUNK, signInButton } from './helpers';

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test.describe('M6-AC5 the Supabase SDK is loaded lazily (ADR-18, NFR-03)', () => {
  test('browsing every screen signed out makes no request to the mock and never loads the SDK chunk; index.html does not preload it', async ({ page }) => {
    const rec = recordRequests(page);
    for (const hash of ['/today', '/goals', '/review', '/settings']) {
      await gotoHash(page, hash);
      await expect(page.locator('main h1')).toBeVisible();
    }
    await expect(signInButton(page)).toBeVisible();
    expect(rec.mock()).toEqual([]);
    expect(rec.sdk()).toEqual([]);
    expect(rec.external()).toEqual([]);

    const html = await (await page.request.get(CLOUD_BASE_URL)).text();
    const preloads = html.match(/<link[^>]+rel="?modulepreload"?[^>]*>/g) ?? [];
    expect(preloads.join('\n')).not.toContain('supabase-client');
    expect(html).not.toContain('supabase-client');
    expect(await page.evaluate(() => localStorage.getItem('opb-auth'))).toBeNull();
  });

  test('clicking "Sign in with Google" loads the SDK chunk, then navigates to the provider', async ({ page }) => {
    const rec = recordRequests(page);
    await gotoHash(page, '/settings');
    expect(rec.sdk()).toEqual([]);
    const chunk = page.waitForRequest((req) => SDK_CHUNK.test(new URL(req.url()).pathname));
    await signInButton(page).click();
    const req = await chunk;
    expect(req.url().startsWith(CLOUD_BASE_URL)).toBe(true);
    await page.waitForURL((u) => u.origin === MOCK_SUPABASE_URL);
    expect(rec.sdk()).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Minh Test', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
  });
});
