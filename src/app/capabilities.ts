// What the running build/platform can do (ARCHITECTURE §5.12). Computed once in the composition root and
// read by the UI through the container; the UI never imports integration code to find out where it runs.
import { PUBLIC_SITE_URL } from '../config/constants';
import type { NativePlatform } from '../integration/platform';

export interface AppCapabilities {
  platform: 'web' | 'ios' | 'android';
  /** Web build: true; native build: false (no sw.js, no "New version" toast). */
  serviceWorker: boolean;
  /** "Add to Home Screen" / "Install the app" copy: web true, native build false. */
  pwaHints: boolean;
  /** Export goes through the share sheet (native runtime present). */
  nativeShare: boolean;
  /** Native sign-in (IdTokenProvider) — M14. */
  nativeAuth: boolean;
  /** `nativeAuth && platform === 'ios'` — M14. */
  appleSignIn: boolean;
  /** Notifications scheduled by the OS — M15. */
  scheduledNotifications: boolean;
  /** Base of the public pages (privacy.html, support.html): relative on the web, absolute on native. */
  publicSiteUrl: string;
}

export interface CapabilitiesInput {
  /** The Capacitor runtime, or `null` (web build, or the native build opened in a browser). */
  native: NativePlatform | null;
  /** `__OPB_NATIVE__`: compile-time branches (no service worker, no PWA hints) apply even when `native` is null. */
  nativeBuild: boolean;
  /** `import.meta.env.BASE_URL` of the web build. */
  baseUrl: string;
}

export function computeCapabilities({ native, nativeBuild, baseUrl }: CapabilitiesInput): AppCapabilities {
  return {
    platform: native?.platform ?? 'web',
    serviceWorker: !nativeBuild,
    pwaHints: !nativeBuild,
    nativeShare: native !== null,
    nativeAuth: false,
    appleSignIn: false,
    scheduledNotifications: false,
    publicSiteUrl: nativeBuild ? PUBLIC_SITE_URL : baseUrl,
  };
}
