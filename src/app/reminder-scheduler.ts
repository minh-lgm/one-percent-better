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
}

/** Start checking; returns a function that stops the schedule. */
export function startReminderScheduler({ check, intervalMs, deps = {} }: ReminderSchedulerOptions): () => void {
  const d: SchedulerDeps = {
    setInterval: deps.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: deps.clearInterval ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>)),
    document: deps.document ?? (typeof document !== 'undefined' ? document : undefined),
    now: deps.now ?? (() => new Date()),
  };
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void check(d.now())
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  };
  const onVisibility = () => {
    if (d.document?.visibilityState === 'visible') run();
  };

  run();
  const id = d.setInterval(run, intervalMs);
  d.document?.addEventListener('visibilitychange', onVisibility);
  return () => {
    d.clearInterval(id);
    d.document?.removeEventListener('visibilitychange', onVisibility);
  };
}
