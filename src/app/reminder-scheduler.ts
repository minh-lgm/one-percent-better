// Reminder check schedule while the app is open (ARCHITECTURE §5.6): at startup,
// every `intervalMs`, and whenever the tab becomes visible again.

export interface SchedulerDeps {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  now: () => Date;
}

export interface ReminderSchedulerOptions {
  check: (now: Date) => Promise<unknown>;
  intervalMs: number;
  deps?: Partial<SchedulerDeps>;
  /** v5.0 (ARCH §5.12): extra trigger source, the native `resume` event; same effect as `visibilitychange` to visible. */
  resume?: (cb: () => void) => () => void;
}

/** Start checking; returns a function that stops the schedule. */
export function startReminderScheduler({ check, intervalMs, deps = {}, resume }: ReminderSchedulerOptions): () => void {
  const d: SchedulerDeps = {
    setInterval: deps.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: deps.clearInterval ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>)),
    document: deps.document ?? (typeof document !== 'undefined' ? document : undefined),
    now: deps.now ?? (() => new Date()),
  };
  let running = false;
  let rerun = false;
  const run = () => {
    if (running) {
      // Remember the trigger (e.g. tab became visible) and check again once the current run ends.
      rerun = true;
      return;
    }
    running = true;
    void check(d.now())
      .catch(() => undefined)
      .finally(() => {
        running = false;
        if (rerun) {
          rerun = false;
          run();
        }
      });
  };
  const onVisibility = () => {
    if (d.document?.visibilityState === 'visible') run();
  };

  run();
  const id = d.setInterval(run, intervalMs);
  d.document?.addEventListener('visibilitychange', onVisibility);
  const stopResume = resume?.(run);
  return () => {
    d.clearInterval(id);
    d.document?.removeEventListener('visibilitychange', onVisibility);
    stopResume?.();
  };
}
