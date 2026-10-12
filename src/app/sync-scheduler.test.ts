// Sync triggers (M7-AC8 scheduler part, FR-46).
import { describe, expect, it } from 'vitest';
import type { Subscribable, SyncMeta } from '../data/repositories';
import type { SyncStatus } from '../domain/sync';
import type { AuthState } from '../services/auth-service';
import type { SyncReason } from '../services/sync-service';
import { CHANGE_DEBOUNCE_MS, startSyncScheduler } from './sync-scheduler';

function harness(initialAuth: AuthState = { kind: 'signed-out' }) {
  const reasons: SyncReason[] = [];
  const calls: string[] = [];
  let status: SyncStatus = { kind: 'idle', pending: 0, lastSyncedAt: null };
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const authListeners = new Set<(s: AuthState) => void>();
  let auth = initialAuth;
  const timers = new Map<number, { fn: () => void; ms: number; interval: boolean }>();
  let seq = 0;
  let visibility: DocumentVisibilityState = 'visible';
  const winListeners = new Map<string, () => void>();
  const docListeners = new Map<string, () => void>();
  const sync = {
    start: () => calls.push('start'),
    syncNow: async (reason: SyncReason) => {
      reasons.push(reason);
      return { status: 'ran', ok: true } as const;
    },
    handleSignedIn: async (userId: string) => {
      calls.push(`signedIn:${userId}`);
      return 'merge-silently' as const;
    },
    reset: async () => {
      calls.push('reset');
    },
    pause: () => calls.push('pause'),
    watchStatus: (): Subscribable<SyncStatus> => ({
      subscribe: (onNext) => {
        statusListeners.add(onNext);
        onNext(status);
        return () => statusListeners.delete(onNext);
      },
    }),
  };
  const stop = startSyncScheduler({
    sync,
    auth: {
      watch: () => ({
        subscribe: (onNext) => {
          authListeners.add(onNext);
          onNext(auth);
          return () => authListeners.delete(onNext);
        },
      }),
    },
    intervalMs: 300_000,
    deps: {
      setTimeout: (fn, ms) => {
        const id = ++seq;
        timers.set(id, {
          fn: () => {
            timers.delete(id);
            fn();
          },
          ms,
          interval: false,
        });
        return id;
      },
      clearTimeout: (id) => timers.delete(id as number),
      setInterval: (fn, ms) => {
        timers.set(++seq, { fn, ms, interval: true });
        return seq;
      },
      clearInterval: (id) => timers.delete(id as number),
      window: { addEventListener: (t: string, l: EventListenerOrEventListenerObject) => winListeners.set(t, l as () => void), removeEventListener: (t: string) => winListeners.delete(t) } as unknown as Window,
      document: {
        get visibilityState() {
          return visibility;
        },
        addEventListener: (t: string, l: EventListenerOrEventListenerObject) => docListeners.set(t, l as () => void),
        removeEventListener: (t: string) => docListeners.delete(t),
      } as unknown as Document,
    },
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    reasons,
    calls,
    stop,
    timers,
    setAuth: (s: AuthState) => {
      auth = s;
      authListeners.forEach((l) => l(s));
    },
    setPending: (n: number) => {
      status = { ...status, pending: n };
      statusListeners.forEach((l) => l(status));
    },
    setVisibility: (v: DocumentVisibilityState) => {
      visibility = v;
    },
    fire: (which: 'online' | 'visibilitychange') => (which === 'online' ? winListeners.get('online')?.() : docListeners.get('visibilitychange')?.()),
    pendingTimeouts: () => [...timers.values()].filter((t) => !t.interval),
    interval: () => [...timers.values()].find((t) => t.interval)!,
    flush,
  };
}

const SIGNED_IN: AuthState = { kind: 'signed-in', userId: 'u1', email: 'minh.test@example.com', name: 'Minh Test' };

describe('startSyncScheduler', () => {
  it('signed-in → handleSignedIn once (re-emits ignored); expired → pause; signed-out after signed-in → reset', async () => {
    const h = harness();
    expect(h.calls).toEqual(['start', 'pause']);
    h.setAuth(SIGNED_IN);
    h.setAuth(SIGNED_IN);
    await h.flush();
    expect(h.calls.filter((c) => c.startsWith('signedIn'))).toEqual(['signedIn:u1']);
    h.setAuth({ kind: 'expired', email: 'x' });
    expect(h.calls[h.calls.length - 1]).toBe('pause');
    h.setAuth(SIGNED_IN);
    await h.flush();
    expect(h.calls.filter((c) => c.startsWith('signedIn'))).toEqual(['signedIn:u1', 'signedIn:u1']);
    h.setAuth({ kind: 'signed-out' });
    expect(h.calls[h.calls.length - 1]).toBe('reset');
    h.stop();
  });

  it('5 local writes within 1.5 s → one cycle 2 s after the last write (debounce 2000 ms); nothing when signed out', async () => {
    const h = harness();
    h.setPending(1);
    expect(h.pendingTimeouts()).toHaveLength(0);
    h.setAuth(SIGNED_IN);
    for (let i = 1; i <= 5; i += 1) h.setPending(i);
    const timeouts = h.pendingTimeouts();
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].ms).toBe(CHANGE_DEBOUNCE_MS);
    timeouts[0].fn();
    await h.flush();
    expect(h.reasons).toEqual(['change']);
    // A falling count (a push finished) does not schedule anything.
    h.setPending(0);
    expect(h.pendingTimeouts()).toHaveLength(0);
    h.stop();
  });

  it('online → one cycle; visibilitychange → cycle only when visible; interval 300000 ms only when visible and signed in', async () => {
    const h = harness(SIGNED_IN);
    await h.flush();
    h.fire('online');
    expect(h.reasons).toEqual(['online']);
    h.setVisibility('hidden');
    h.fire('visibilitychange');
    h.interval().fn();
    expect(h.reasons).toEqual(['online']);
    h.setVisibility('visible');
    h.fire('visibilitychange');
    h.interval().fn();
    expect(h.reasons).toEqual(['online', 'visible', 'interval']);
    expect(h.interval().ms).toBe(300_000);
    h.setAuth({ kind: 'signed-out' });
    h.fire('online');
    h.interval().fn();
    expect(h.reasons).toEqual(['online', 'visible', 'interval']);
    h.stop();
    expect(h.timers.size).toBe(0);
  });

  it('exposes the SyncMeta shape it relies on (type-level smoke)', () => {
    const meta: SyncMeta = { userId: null, lastUserId: null, account: null, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null };
    expect(meta.cursor.goals).toBeNull();
  });
});
