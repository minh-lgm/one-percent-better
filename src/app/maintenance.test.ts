import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSchedule, MAINTENANCE_DELAY_MS, startMaintenance } from './maintenance';

describe('startMaintenance (M10-AC5, ADR-29)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs purgeTombstones exactly once, after the scheduled delay (not synchronously at startup)', async () => {
    const purge = vi.fn(async () => ({ goals: 1, entries: 2 }));
    const now = new Date('2026-11-09T03:00:00.000Z');
    const done = startMaintenance({ purge, clock: () => now, schedule: (run) => setTimeout(run, MAINTENANCE_DELAY_MS) });
    expect(purge).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MAINTENANCE_DELAY_MS - 1);
    expect(purge).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith(now);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('a failing purge is reported with console.warn and never rejects (no unhandledrejection)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const done = startMaintenance({
        purge: async () => {
          throw new Error('IndexedDB closed');
        },
        schedule: (run) => setTimeout(run, 0),
      });
      await vi.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Tombstone purge failed', expect.any(Error));
      await vi.runAllTimersAsync();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a synchronous throw inside purge is handled the same way', async () => {
    const warn = vi.fn();
    const done = startMaintenance({
      purge: () => {
        throw new Error('sync boom');
      },
      schedule: (run) => run(),
      warn,
    });
    await done;
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('defaultSchedule uses requestIdleCallback when present, else setTimeout 2 s', () => {
    const g = globalThis as { requestIdleCallback?: unknown };
    const original = g.requestIdleCallback;
    const ric = vi.fn((cb: () => void) => cb());
    g.requestIdleCallback = ric;
    const run = vi.fn();
    defaultSchedule(run);
    expect(ric).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);

    delete g.requestIdleCallback;
    const run2 = vi.fn();
    defaultSchedule(run2);
    expect(run2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MAINTENANCE_DELAY_MS);
    expect(run2).toHaveBeenCalledTimes(1);
    if (original !== undefined) g.requestIdleCallback = original;
  });
});
