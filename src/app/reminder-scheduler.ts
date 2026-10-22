// Reminder check schedule while the app is open (ARCHITECTURE §5.6): at startup,
// every `intervalMs`, and whenever the tab becomes visible again.
// v5.0 (M15, ARCH §5.6 v5.0): on native the OS delivers scheduled notifications instead, so the native scheduler
// `replan`s the 14-day window at startup, on `resume`, when the reminder settings or the language change and
// (debounced) when goals / entries change; the interval `check()` never runs there.
import type { Subscribable } from '../data/repositories';
import type { Settings } from '../domain/types';

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

// ---- v5.0 (M15): native schedule ----

/** Goal / entry changes are gathered for this long before the schedule is rebuilt (ARCH §5.6 v5.0). */
export const REPLAN_DEBOUNCE_MS = 2000;

export interface NativeSchedulerDeps {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => Date;
}

export interface NativeReminderSchedulerOptions {
  replan: (now: Date) => Promise<unknown>;
  /** The Capacitor `resume` event (ARCH §5.12). */
  resume: (cb: () => void) => () => void;
  /** kv `settings`: a change of `reminderEnabled` / `reminderTime` replans at once (other fields are ignored). */
  settings: Subscribable<Pick<Settings, 'reminderEnabled' | 'reminderTime'>>;
  /** kv `locale`: a change replans at once (the notification text is fixed at scheduling time, DESIGN 7.8.4). */
  locale: Subscribable<string | undefined>;
  /** Any emission after the first of each source = a goal / entry change → one replan after the debounce. */
  changes: Subscribable<unknown>[];
  deps?: Partial<NativeSchedulerDeps>;
}

/**
 * Start the native triggers; returns the stop function. `replan` itself coalesces concurrent calls, so every
 * trigger simply calls it; errors are swallowed here (the next trigger tries again).
 */
export function startNativeReminderScheduler({ replan, resume, settings, locale, changes, deps = {} }: NativeReminderSchedulerOptions): () => void {
  const d: NativeSchedulerDeps = {
    setTimeout: deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    clearTimeout: deps.clearTimeout ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
    now: deps.now ?? (() => new Date()),
  };
  const run = () => void replan(d.now()).catch(() => undefined);

  let debounce: unknown = null;
  const onChange = () => {
    if (debounce !== null) d.clearTimeout(debounce);
    debounce = d.setTimeout(() => {
      debounce = null;
      run();
    }, REPLAN_DEBOUNCE_MS);
  };

  // Startup.
  run();
  const stopResume = resume(run);

  // Settings: only the reminder fields matter; the first emission is the current value (already planned at startup).
  let lastReminder: string | null = null;
  const stopSettings = settings.subscribe((s) => {
    const key = `${s.reminderEnabled ? 1 : 0}|${s.reminderTime}`;
    if (lastReminder !== null && lastReminder !== key) run();
    lastReminder = key;
  }, () => undefined);

  let lastLocale: string | undefined | null = null;
  const stopLocale = locale.subscribe((l) => {
    if (lastLocale !== null && lastLocale !== l) run();
    lastLocale = l;
  }, () => undefined);

  const stopChanges = changes.map((source) => {
    let first = true;
    return source.subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      onChange();
    }, () => undefined);
  });

  return () => {
    stopResume();
    stopSettings();
    stopLocale();
    stopChanges.forEach((stop) => stop());
    if (debounce !== null) d.clearTimeout(debounce);
  };
}
