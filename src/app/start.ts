// Post-render wiring (ARCHITECTURE §5.12 "Thứ tự khởi động"), extracted from main.tsx so the native branch
// is testable: maintenance, reminder scheduler, service-worker messages, sync scheduler and the service
// worker itself. On the native build (`__OPB_NATIVE__`) there is no service worker and no SW message
// channel; the Capacitor `resume` event feeds the same triggers as `visibilitychange`. M13: the native system UI
// (status bar, keyboard class) starts after the render and the launch image is hidden exactly once — after the
// first render, or after `splashTimeoutMs` if the render has not finished by then (DESIGN "Native shell" 2).
import type { NativePlatform } from '../integration/platform';
import type { ServiceWorkerHandle } from '../integration/sw-register';
import type { AppContainer } from './container';
import { startMaintenance } from './maintenance';
import { startReminderScheduler } from './reminder-scheduler';
import { startSyncScheduler } from './sync-scheduler';

export interface StartDeps {
  registerServiceWorker: (options: { swUrl: string; onUpdateAvailable: () => void }) => Promise<ServiceWorkerHandle | null>;
  listenForNavigation: () => () => void;
  startMaintenance: typeof startMaintenance;
  startReminderScheduler: typeof startReminderScheduler;
  startSyncScheduler: typeof startSyncScheduler;
}

export interface StartOptions {
  container: AppContainer;
  reminderCheckIntervalMs: number;
  syncIntervalMs: number;
  /** `import.meta.env.PROD`: the service worker is registered in production builds only (ADR-06). */
  prod: boolean;
  /** `import.meta.env.BASE_URL`. */
  baseUrl: string;
  deps: StartDeps;
}

export const SPLASH_TIMEOUT_MS = 3000;

/**
 * M13 (M13-D1): native system UI (status-bar style, keyboard class) and the launch image. Armed in main.tsx right
 * after the runtime loads — before bootstrap — so the launch image is hidden after the first commit of whatever
 * renders first (the app or the S8 storage-error screen), or after `timeoutMs` if nothing renders in time.
 * `null` runtime (web) → no-op. Returns the stop function.
 */
export function startNativeShell(native: NativePlatform | null, firstRender: Promise<void>, timeoutMs = SPLASH_TIMEOUT_MS): () => void {
  const systemUi = native?.systemUi;
  if (!systemUi) return () => {};
  const stop = systemUi.start();
  const cancel = hideSplashOnce(() => systemUi.hideSplash(), firstRender, timeoutMs);
  return () => {
    stop();
    cancel();
  };
}

/**
 * Hide the launch image exactly once: when `firstRender` settles or when `timeoutMs` elapses, whichever comes
 * first. Returns a cancel function (tests / teardown).
 */
export function hideSplashOnce(hide: () => Promise<void>, firstRender: Promise<void>, timeoutMs = SPLASH_TIMEOUT_MS): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    void hide().catch(() => undefined);
  };
  const timer = setTimeout(once, timeoutMs);
  void firstRender.then(once, once);
  return () => clearTimeout(timer);
}

/** Starts the background work; returns a function that stops it (tests). */
export function startApp({ container, reminderCheckIntervalMs, syncIntervalMs, prod, baseUrl, deps }: StartOptions): () => void {
  const stops: Array<() => void> = [];
  const resume = container.native ? (cb: () => void) => container.native!.lifecycle.onResume(cb) : undefined;
  // The native system UI / launch image are NOT handled here (startNativeShell, armed before bootstrap — M13-D1).

  // Old tombstones are purged once, after the first paint (ADR-29); cloud on or off.
  void deps.startMaintenance({ purge: (now) => container.purgeTombstones(now) });
  // Daily reminder: check now, every interval and when the tab becomes visible / the app resumes (ARCH §5.6).
  stops.push(deps.startReminderScheduler({ check: (now) => container.reminderService.check(now), intervalMs: reminderCheckIntervalMs, resume }));
  // M7: background sync triggers (sign-in, startup, online, visible/resume, 2 s after a change, every interval).
  if (container.syncService) stops.push(deps.startSyncScheduler({ sync: container.syncService, auth: container.authService, intervalMs: syncIntervalMs, resume }));

  // `capabilities.serviceWorker` is false on the native build (ADR-35), whether or not the Capacitor runtime is present.
  if (container.capabilities.serviceWorker) {
    // A click on the reminder notification asks the page to go to Today (service-worker message).
    stops.push(deps.listenForNavigation());
    // Service worker only in production builds (ADR-06); dev server runs without it.
    if (prod) {
      void deps
        .registerServiceWorker({ swUrl: `${baseUrl}sw.js`, onUpdateAvailable: () => container.updates.notify() })
        .then((handle) => container.updates.setHandle(handle));
    }
  }

  return () => stops.forEach((stop) => stop());
}
