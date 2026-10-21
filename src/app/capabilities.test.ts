// M12-AC4: `AppCapabilities` computed in the composition root (ARCH §5.12), and what the container does with
// them: on native (M12 … M13) the account is `unavailable` even with a cloud configuration and the SDK loader
// is never called; the web container is unchanged.
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_SITE_URL } from '../config/constants';
import { createTestContainer, type TestContainer } from '../test/container';
import { computeCapabilities } from './capabilities';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const ios = { platform: 'ios' as const, fileExport: { saveText: async () => 'shared' as const }, lifecycle: { onResume: () => () => {} } };

describe('computeCapabilities', () => {
  it('web build', () => {
    expect(computeCapabilities({ native: null, nativeBuild: false, baseUrl: '/one-percent-better/' })).toEqual({
      platform: 'web',
      serviceWorker: true,
      pwaHints: true,
      nativeShare: false,
      nativeAuth: false,
      appleSignIn: false,
      scheduledNotifications: false,
      publicSiteUrl: '/one-percent-better/',
    });
  });

  it('native build on iOS (M12)', () => {
    expect(computeCapabilities({ native: ios, nativeBuild: true, baseUrl: '/' })).toEqual({
      platform: 'ios',
      serviceWorker: false,
      pwaHints: false,
      nativeShare: true,
      nativeAuth: false,
      appleSignIn: false,
      scheduledNotifications: false,
      publicSiteUrl: 'https://minh-lgm.github.io/one-percent-better/',
    });
    expect(PUBLIC_SITE_URL).toBe('https://minh-lgm.github.io/one-percent-better/');
  });

  it("native build opened in a browser (Capacitor 'web'): compile-time branches apply, runtime ones do not", () => {
    const c = computeCapabilities({ native: null, nativeBuild: true, baseUrl: '/' });
    expect(c).toMatchObject({ platform: 'web', serviceWorker: false, pwaHints: false, nativeShare: false, publicSiteUrl: PUBLIC_SITE_URL });
  });
});

describe('createContainer with a native platform', () => {
  it('iOS + cloud configuration: capabilities native, account unavailable, SDK loader never called, no sync service', async () => {
    tc = await createTestContainer({ cloud: true, authStored: true, native: 'ios' });
    expect(tc.container.capabilities).toEqual({
      platform: 'ios',
      serviceWorker: false,
      pwaHints: false,
      nativeShare: true,
      nativeAuth: false,
      appleSignIn: false,
      scheduledNotifications: false,
      publicSiteUrl: PUBLIC_SITE_URL,
    });
    await tc.container.authService.init({ callbackPending: false });
    expect(tc.container.authService.state().kind).toBe('unavailable');
    expect(tc.container.authService.isAvailable()).toBe(false);
    expect(tc.auth!.state.loads).toBe(0);
    expect(tc.container.syncService).toBeNull();
    // Export goes through the platform's port; notifications are "unsupported" until M15; no persist() story.
    expect(tc.container.fileExport).toBe(tc.native!.fileExport);
    expect(tc.fileExport).toBe(tc.native!.fileExport);
    expect(tc.container.notifications.permission()).toBe('unsupported');
    expect(await tc.container.notifications.requestPermission()).toBe('unsupported');
    expect(await tc.container.storagePersistence).toBe('unsupported');
    expect(tc.container.native?.platform).toBe('ios');
  });

  it('web (no native): capabilities as before and the account works as in M6', async () => {
    tc = await createTestContainer({ cloud: true });
    expect(tc.container.capabilities).toMatchObject({ platform: 'web', serviceWorker: true, pwaHints: true, nativeShare: false, nativeAuth: false, publicSiteUrl: '/' });
    expect(tc.container.authService.isAvailable()).toBe(true);
    expect(tc.container.syncService).not.toBeNull();
    expect(tc.container.native).toBeNull();
    expect(await tc.container.storagePersistence).toBe('persisted');
  });

  it('web container without cloud: unchanged (account unavailable because there is no configuration)', async () => {
    tc = await createTestContainer();
    expect(tc.container.capabilities.platform).toBe('web');
    expect(tc.container.authService.state().kind).toBe('unavailable');
  });
});

// ---- M14: a runtime with native sign-in (ARCH §5.12 `idTokens`, §5.9 v5.0) ----
describe('createContainer with native sign-in (M14)', () => {
  it('iOS + idTokens + cloud: nativeAuth and appleSignIn true, the account service is available and uses the sheets, sync service present', async () => {
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true });
    expect(tc.container.capabilities).toMatchObject({ platform: 'ios', nativeAuth: true, appleSignIn: true, nativeShare: true, serviceWorker: false });
    expect(tc.container.authService.isAvailable()).toBe(true);
    expect(tc.container.syncService).not.toBeNull();
    await tc.container.authService.init();
    expect((await tc.container.authService.signIn('#/settings', 'apple')).ok).toBe(true);
    expect(tc.auth!.idTokens!.count('getIdToken', 'apple')).toBe(1);
    expect(tc.auth!.port.calls.signIn).toBe(0);
    expect(tc.container.authService.state()).toMatchObject({ kind: 'signed-in', providers: ['apple'] });
  });

  it('android + idTokens: nativeAuth true but appleSignIn false (ADR-37)', async () => {
    tc = await createTestContainer({ cloud: true, native: 'android', idTokens: true });
    expect(tc.container.capabilities).toMatchObject({ platform: 'android', nativeAuth: true, appleSignIn: false });
    expect(tc.auth!.idTokens!.available('apple')).toBe(false);
  });

  it('iOS + idTokens without cloud configuration: account still unavailable (FR-38)', async () => {
    tc = await createTestContainer({ native: 'ios', idTokens: true });
    expect(tc.container.capabilities).toMatchObject({ nativeAuth: true, appleSignIn: true });
    expect(tc.container.authService.state().kind).toBe('unavailable');
  });

  it('computeCapabilities: idTokens on the platform object is what nativeAuth means', () => {
    const sheets = { available: () => true, getIdToken: async () => ({ kind: 'cancelled' as const }), logout: async () => undefined };
    expect(computeCapabilities({ native: { ...ios, idTokens: sheets }, nativeBuild: true, baseUrl: '/' })).toMatchObject({ nativeAuth: true, appleSignIn: true });
    expect(computeCapabilities({ native: { ...ios, platform: 'android', idTokens: sheets }, nativeBuild: true, baseUrl: '/' })).toMatchObject({ nativeAuth: true, appleSignIn: false });
  });
});
