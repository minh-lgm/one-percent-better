// M12-AC4: the platform loader (ARCH §5.12, ADR-35). In Vitest `__OPB_NATIVE__` is false, so the real
// `loadNativePlatform()` is the web branch; the testable core takes the flag and the loader as parameters.
import { describe, expect, it, vi } from 'vitest';
import { loadNativePlatform, resolveNativePlatform, type NativeModule, type NativePlatform } from './platform';

const ios: NativePlatform = {
  platform: 'ios',
  fileExport: { saveText: async () => 'shared' },
  lifecycle: { onResume: () => () => {} },
};

describe('resolveNativePlatform', () => {
  it('web build: null, the loader is never called', async () => {
    const load = vi.fn<() => Promise<NativeModule>>();
    expect(await resolveNativePlatform(false, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(0);
  });

  it("native build on iOS: the module's platform (with fileExport and lifecycle)", async () => {
    const load = vi.fn(async (): Promise<NativeModule> => ({ createNativePlatform: () => ios }));
    const result = await resolveNativePlatform(true, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result?.platform).toBe('ios');
    expect(typeof result?.fileExport.saveText).toBe('function');
    expect(typeof result?.lifecycle.onResume).toBe('function');
  });

  it("native build opened in a browser (Capacitor says 'web'): null", async () => {
    const load = vi.fn(async (): Promise<NativeModule> => ({ createNativePlatform: () => null }));
    expect(await resolveNativePlatform(true, load)).toBeNull();
  });

  it('a failing loader rejects (the app shows the storage error rather than silently running as web)', async () => {
    await expect(resolveNativePlatform(true, async () => Promise.reject(new Error('chunk missing')))).rejects.toThrow('chunk missing');
  });
});

describe('loadNativePlatform (Vitest: __OPB_NATIVE__ = false)', () => {
  it('resolves null without touching the native module', async () => {
    expect(__OPB_NATIVE__).toBe(false);
    expect(await loadNativePlatform()).toBeNull();
  });
});
