// Native platform factory (ARCHITECTURE §5.12, ADR-35). This folder is the ONLY place that imports
// `@capacitor/*`; it is reached from the rest of the app exclusively through the `import()` in
// src/integration/platform.ts, so the web bundle never contains it.
import { Capacitor } from '@capacitor/core';
import { env, type GoogleNativeConfig } from '../../config/env';
import type { NativePlatform } from '../platform';
import { createNativeFileExport } from './file-export';
import { createLifecycle } from './lifecycle';
import { createLocalNotifications } from './local-notifications';
import { createSocialLogin } from './social-login';
import { createSystemUi } from './system-ui';

export interface NativeDeps {
  getPlatform: () => string;
  /** M14: public Google client IDs from the build environment (both needed for Google Sign-In). */
  google: GoogleNativeConfig;
}

const defaultDeps = (): NativeDeps => ({ getPlatform: () => Capacitor.getPlatform(), google: env.google });

/**
 * `null` when the Capacitor runtime reports `'web'` (the native build opened in a browser, e.g. the
 * Playwright project `native-web`): the app then falls back to the web adapters.
 */
export function createNativePlatform(deps: NativeDeps = defaultDeps()): NativePlatform | null {
  const platform = deps.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return null;
  // M15 (ADR-40): the OS delivers the reminder schedule; a tap on a notification opens Today for the app's lifetime.
  const notifications = createLocalNotifications();
  notifications.listen();
  return {
    platform,
    fileExport: createNativeFileExport(),
    lifecycle: createLifecycle(),
    systemUi: createSystemUi(),
    notifications,
    // M14 (ADR-36): the sheets exist on every native platform; what each one offers is `available()`'s business.
    idTokens: createSocialLogin({ platform, googleWebClientId: deps.google.webClientId, googleIosClientId: deps.google.iosClientId }),
  };
}
