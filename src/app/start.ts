// Post-render wiring (ARCHITECTURE §5.12 "Thứ tự khởi động"), extracted from main.tsx so the native branch
// is testable: maintenance, reminder scheduler, service-worker messages, sync scheduler and the service
// worker itself. On the native build (`__OPB_NATIVE__`) there is no service worker and no SW message
// channel; the Capacitor `resume` event feeds the same triggers as `visibilitychange`.
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

/** Starts the background work; returns a function that stops it (tests). */
export function startApp({ container, reminderCheckIntervalMs, syncIntervalMs, prod, baseUrl, deps }: StartOptions): () => void {
  const stops: Array<() => void> = [];
  const resume = container.native ? (cb: () => void) => container.native!.lifecycle.onResume(cb) : undefined;

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
