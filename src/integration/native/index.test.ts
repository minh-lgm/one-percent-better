// M12-AC4: `createNativePlatform()` asks the Capacitor runtime where it runs (ARCH §5.12). Plugins are mocked
// (TASKS phase 6: no unit test calls native code).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: vi.fn(() => 'web') } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => {} })) } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn() }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

import { Capacitor } from '@capacitor/core';
import { createNativePlatform } from './index';

describe('createNativePlatform', () => {
  it("'ios' → platform ios with fileExport and lifecycle", () => {
    const p = createNativePlatform({ getPlatform: () => 'ios' });
    expect(p?.platform).toBe('ios');
    expect(typeof p?.fileExport.saveText).toBe('function');
    expect(typeof p?.lifecycle.onResume).toBe('function');
  });

  it("'android' → platform android", () => {
    expect(createNativePlatform({ getPlatform: () => 'android' })?.platform).toBe('android');
  });

  it("'web' (the native build opened in a browser) → null", () => {
    expect(createNativePlatform({ getPlatform: () => 'web' })).toBeNull();
  });

  it('default deps read Capacitor.getPlatform()', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValueOnce('ios');
    expect(createNativePlatform()?.platform).toBe('ios');
    vi.mocked(Capacitor.getPlatform).mockReturnValueOnce('web');
    expect(createNativePlatform()).toBeNull();
  });
});
