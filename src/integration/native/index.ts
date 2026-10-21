// Native platform factory (ARCHITECTURE §5.12, ADR-35). This folder is the ONLY place that imports
// `@capacitor/*`; it is reached from the rest of the app exclusively through the `import()` in
// src/integration/platform.ts, so the web bundle never contains it.
import { Capacitor } from '@capacitor/core';
import type { NativePlatform } from '../platform';
import { createNativeFileExport } from './file-export';
import { createLifecycle } from './lifecycle';
import { createSystemUi } from './system-ui';

export interface NativeDeps {
  getPlatform: () => string;
}

const defaultDeps = (): NativeDeps => ({ getPlatform: () => Capacitor.getPlatform() });

/**
 * `null` when the Capacitor runtime reports `'web'` (the native build opened in a browser, e.g. the
 * Playwright project `native-web`): the app then falls back to the web adapters.
 */
export function createNativePlatform(deps: NativeDeps = defaultDeps()): NativePlatform | null {
  const platform = deps.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return null;
  return {
    platform,
    fileExport: createNativeFileExport(),
    lifecycle: createLifecycle(),
    systemUi: createSystemUi(),
  };
}
