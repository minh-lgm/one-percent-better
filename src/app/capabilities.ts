// What the running build/platform can do (ARCHITECTURE §5.12). Computed once in the composition root and
// read by the UI through the container; the UI never imports integration code to find out where it runs.
import { PUBLIC_SITE_URL } from '../config/constants';
import type { NativePlatform } from '../integration/platform';
import type { NotificationPort } from '../services/notification-port';

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
  /** Web: always (PKCE redirect). Native: only when the sheet has both Google client ids (`VITE_GOOGLE_*`, M14-D1). */
  googleSignIn: boolean;
  /** Notifications scheduled by the OS (`NotificationPort.canSchedule`) — M15. */
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
  /** v5.0 (M15): the notification port the container wires (web, native adapter, or a test fake). */
  notifications?: Pick<NotificationPort, 'canSchedule'>;
}

export function computeCapabilities({ native, nativeBuild, baseUrl, notifications }: CapabilitiesInput): AppCapabilities {
  return {
    platform: native?.platform ?? 'web',
    serviceWorker: !nativeBuild,
    pwaHints: !nativeBuild,
    nativeShare: native !== null,
    nativeAuth: native?.idTokens !== undefined,
    appleSignIn: native?.idTokens !== undefined && native.platform === 'ios',
    googleSignIn: native?.idTokens ? native.idTokens.available('google') : true,
    scheduledNotifications: notifications?.canSchedule ?? false,
    publicSiteUrl: nativeBuild ? PUBLIC_SITE_URL : baseUrl,
  };
}
