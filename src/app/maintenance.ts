// Startup maintenance (ARCHITECTURE §3 v3.1, ADR-29): purge old tombstones once per app start,
// after the first render and off the critical path. Errors are logged, never shown.

export interface MaintenanceOptions {
  /** `LocalSyncStore.purgeTombstones` (wired by the container, cloud on or off). */
  purge: (now: Date) => Promise<{ goals: number; entries: number }>;
  clock?: () => Date;
  /** How to defer the run: defaults to `requestIdleCallback`, else `setTimeout` 2 s. */
  schedule?: (run: () => void) => void;
  warn?: (message: string, error: unknown) => void;
}

export const MAINTENANCE_DELAY_MS = 2000;

/** Default deferral: idle time when the browser offers it, otherwise a short timer. */
export function defaultSchedule(run: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 10_000 });
  } else {
    setTimeout(run, MAINTENANCE_DELAY_MS);
  }
}

/**
 * Schedule exactly one purge. The returned promise settles after the purge ran (or failed) and
 * never rejects, so callers can fire-and-forget without an `unhandledrejection`.
 */
export function startMaintenance({ purge, clock = () => new Date(), schedule = defaultSchedule, warn = (m, e) => console.warn(m, e) }: MaintenanceOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    schedule(() => {
      Promise.resolve()
        .then(() => purge(clock()))
        .catch((e: unknown) => warn('Tombstone purge failed', e))
        .then(() => resolve());
    });
  });
}
