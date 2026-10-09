import { describe, expect, it, vi } from 'vitest';
import { startReminderScheduler } from './reminder-scheduler';

function fakeDocument(state: 'visible' | 'hidden' = 'visible') {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state,
    addEventListener: (_t: string, l: EventListenerOrEventListenerObject) => listeners.add(l as () => void),
    removeEventListener: (_t: string, l: EventListenerOrEventListenerObject) => listeners.delete(l as () => void),
    fire: () => listeners.forEach((l) => l()),
    size: () => listeners.size,
  } as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> & { fire(): void; size(): number; visibilityState: string };
}

describe('startReminderScheduler (ARCH §5.6)', () => {
  it('checks at startup, on every interval tick and when the tab becomes visible', async () => {
    const check = vi.fn(async () => true);
    let tick: (() => void) | undefined;
    const clearInterval = vi.fn();
    const doc = fakeDocument();
    const now = new Date('2026-10-09T20:00:30+07:00');
    const stop = startReminderScheduler({
      check,
      intervalMs: 60_000,
      deps: {
        setInterval: (fn, ms) => {
          expect(ms).toBe(60_000);
          tick = fn;
          return 'id';
        },
        clearInterval,
        document: doc,
        now: () => now,
      },
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(now);
    const settle = () => new Promise((r) => setTimeout(r, 0));
    await settle();
    tick?.();
    await settle();
    tick?.();
    await settle();
    expect(check).toHaveBeenCalledTimes(3);
    doc.fire();
    expect(check).toHaveBeenCalledTimes(4);
    doc.visibilityState = 'hidden';
    doc.fire();
    expect(check).toHaveBeenCalledTimes(4);
    stop();
    expect(clearInterval).toHaveBeenCalledWith('id');
    expect(doc.size()).toBe(0);
  });

  it('does not overlap checks and survives a failing check', async () => {
    let resolve: (() => void) | undefined;
    const check = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    let tick: (() => void) | undefined;
    startReminderScheduler({ check, intervalMs: 1000, deps: { setInterval: (fn) => ((tick = fn), 1), clearInterval: () => {}, document: undefined } });
    tick?.();
    expect(check).toHaveBeenCalledTimes(1);
    resolve?.();
    await new Promise((r) => setTimeout(r, 0));
    tick?.();
    expect(check).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(() => startReminderScheduler({ check: failing, intervalMs: 1000, deps: { setInterval: () => 1, clearInterval: () => {}, document: undefined } })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
