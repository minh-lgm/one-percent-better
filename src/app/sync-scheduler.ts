// When to sync (ARCHITECTURE §5.10 "Trigger", FR-46): after sign-in / at startup with a session,
// on `online`, when the tab becomes visible, ~2 s after a local change (debounced), every
// `intervalMs` while visible, and "Sync now" (handled by the UI). Also: sign-out → reset,
// session expired → pause. The service itself is single-flight; a trigger that arrives while a
// cycle runs is remembered and run once more afterwards (like the reminder scheduler).
import type { Subscribable } from '../data/repositories';
import type { AuthState } from '../services/auth-service';
import type { SyncService } from '../services/sync-service';

export const CHANGE_DEBOUNCE_MS = 2000;

export interface SyncSchedulerDeps {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

export interface SyncSchedulerOptions {
  sync: Pick<SyncService, 'syncNow' | 'handleSignedIn' | 'reset' | 'pause' | 'watchStatus' | 'start'>;
  auth: { watch(): Subscribable<AuthState> };
  intervalMs: number;
  deps?: Partial<SyncSchedulerDeps>;
  /** v5.0 (ARCH §5.12): extra trigger source, the native `resume` event; same effect as `visibilitychange` to visible. */
  resume?: (cb: () => void) => () => void;
}

/** Start the triggers; returns a function that stops everything. */
export function startSyncScheduler({ sync, auth, intervalMs, deps = {}, resume }: SyncSchedulerOptions): () => void {
  const d: SyncSchedulerDeps = {
    setTimeout: deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    clearTimeout: deps.clearTimeout ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
    setInterval: deps.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: deps.clearInterval ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>)),
    window: deps.window ?? (typeof window !== 'undefined' ? window : undefined),
    document: deps.document ?? (typeof document !== 'undefined' ? document : undefined),
  };
  const visible = () => !d.document || d.document.visibilityState === 'visible';

  let signedInUser: string | null = null;
  let debounce: unknown = null;
  let lastPending = -1;

  const onChange = () => {
    if (!signedInUser) return;
    if (debounce !== null) d.clearTimeout(debounce);
    debounce = d.setTimeout(() => {
      debounce = null;
      void sync.syncNow('change');
    }, CHANGE_DEBOUNCE_MS);
  };

  sync.start();
  const stopStatus = sync.watchStatus().subscribe((s) => {
    // A rising pending count = a local write (or a cascade): gather writes for 2 s, then push.
    if (lastPending !== -1 && s.pending > lastPending) onChange();
    lastPending = s.pending;
  });

  const stopAuth = auth.watch().subscribe((state) => {
    if (state.kind === 'signed-in') {
      if (signedInUser === state.userId) return; // re-emitted (e.g. verified after startup): already handled
      signedInUser = state.userId;
      void sync.handleSignedIn(state.userId, state.email);
      return;
    }
    if (state.kind === 'expired' || state.kind === 'signing-in') {
      // Expired: stop retrying. Signing in (OAuth callback in progress, possibly for another account):
      // abort whatever cycle is running; `signed-in` below starts over for the account that arrives (M7-D2).
      signedInUser = null;
      sync.pause();
      return;
    }
    if (state.kind === 'signed-out') {
      const was = signedInUser;
      signedInUser = null;
      if (was !== null) void sync.reset();
      else sync.pause();
    }
  });

  const onOnline = () => {
    if (signedInUser) void sync.syncNow('online');
  };
  const onVisibility = () => {
    if (signedInUser && visible()) void sync.syncNow('visible');
  };
  const interval = d.setInterval(() => {
    if (signedInUser && visible()) void sync.syncNow('interval');
  }, intervalMs);
  d.window?.addEventListener('online', onOnline);
  d.document?.addEventListener('visibilitychange', onVisibility);
  const stopResume = resume?.(onVisibility);

  return () => {
    stopStatus();
    stopAuth();
    d.clearInterval(interval);
    if (debounce !== null) d.clearTimeout(debounce);
    d.window?.removeEventListener('online', onOnline);
    d.document?.removeEventListener('visibilitychange', onVisibility);
    stopResume?.();
  };
}
