// M12-AC4: `createNativePlatform()` asks the Capacitor runtime where it runs (ARCH §5.12). Plugins are mocked
// (TASKS phase 6: no unit test calls native code).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: vi.fn(() => 'web') } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => {} })) } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn() }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { checkPermissions: vi.fn(async () => ({ display: 'prompt' })), requestPermissions: vi.fn(), getPending: vi.fn(async () => ({ notifications: [] })), cancel: vi.fn(), schedule: vi.fn(), addListener: vi.fn(async () => ({ remove: async () => {} })) } }));
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

import { Capacitor } from '@capacitor/core';
import { createNativePlatform } from './index';

const NO_GOOGLE = { webClientId: null, iosClientId: null };
const GOOGLE = { webClientId: '1-web.apps.googleusercontent.com', iosClientId: '1-ios.apps.googleusercontent.com' };

describe('createNativePlatform', () => {
  it("'ios' → platform ios with fileExport, lifecycle and (M14) idTokens: Apple available, Google only with both client IDs", () => {
    const p = createNativePlatform({ getPlatform: () => 'ios', google: NO_GOOGLE });
    expect(p?.platform).toBe('ios');
    expect(typeof p?.fileExport.saveText).toBe('function');
    expect(typeof p?.lifecycle.onResume).toBe('function');
    expect(p?.idTokens?.available('apple')).toBe(true);
    expect(p?.idTokens?.available('google')).toBe(false);
    expect(createNativePlatform({ getPlatform: () => 'ios', google: GOOGLE })?.idTokens?.available('google')).toBe(true);
  });

  it("'android' → platform android; no Apple (ADR-37)", () => {
    const p = createNativePlatform({ getPlatform: () => 'android', google: GOOGLE });
    expect(p?.platform).toBe('android');
    expect(p?.idTokens?.available('apple')).toBe(false);
    expect(p?.idTokens?.available('google')).toBe(true);
  });

  it("'web' (the native build opened in a browser) → null", () => {
    expect(createNativePlatform({ getPlatform: () => 'web', google: GOOGLE })).toBeNull();
  });

  it('default deps read Capacitor.getPlatform()', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValueOnce('ios');
    expect(createNativePlatform()?.platform).toBe('ios');
    vi.mocked(Capacitor.getPlatform).mockReturnValueOnce('web');
    expect(createNativePlatform()).toBeNull();
  });
});
