// Post-render wiring (ARCHITECTURE §5.12 "Thứ tự khởi động"), extracted from main.tsx so the native branch
// is testable: maintenance, reminder scheduler, service-worker messages, sync scheduler and the service
// worker itself. On the native build (`__OPB_NATIVE__`) there is no service worker and no SW message
// channel; the Capacitor `resume` event feeds the same triggers as `visibilitychange`. M13: the native system UI
// (status bar, keyboard class) starts after the render and the launch image is hidden exactly once — after the
// first render, or after `splashTimeoutMs` if the render has not finished by then (DESIGN "Native shell" 2).
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
  /** Resolves after React's first commit (main.tsx); the native launch image is hidden when it settles. */
  firstRender?: Promise<void>;
  /** Fallback: hide the launch image after this many ms even if the first render has not completed (default 3000). */
  splashTimeoutMs?: number;
}

export const SPLASH_TIMEOUT_MS = 3000;

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
export function startApp({ container, reminderCheckIntervalMs, syncIntervalMs, prod, baseUrl, deps, firstRender, splashTimeoutMs = SPLASH_TIMEOUT_MS }: StartOptions): () => void {
  const stops: Array<() => void> = [];
  const resume = container.native ? (cb: () => void) => container.native!.lifecycle.onResume(cb) : undefined;

  // M13: native system UI (status-bar style, keyboard class) and the launch image (ARCH §5.12 "Thứ tự khởi động").
  const systemUi = container.native?.systemUi;
  if (systemUi) {
    stops.push(systemUi.start());
    stops.push(hideSplashOnce(() => systemUi.hideSplash(), firstRender ?? Promise.resolve(), splashTimeoutMs));
  }

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
