// M12-AC4: `lifecycle.onResume` over @capacitor/app (ARCH §5.12). The plugin is mocked.
import { describe, expect, it, vi } from 'vitest';
import type { PluginListenerHandle } from '@capacitor/core';

const listeners = new Map<string, Set<() => void>>();
const removed: string[] = [];
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: string, cb: () => void): Promise<PluginListenerHandle> => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return {
        remove: async () => {
          listeners.get(event)!.delete(cb);
          removed.push(event);
        },
      };
    }),
  },
}));

import { App } from '@capacitor/app';
import { createLifecycle } from './lifecycle';

const fire = (event: string) => listeners.get(event)?.forEach((cb) => cb());
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createLifecycle', () => {
  it('onResume: the callback runs exactly once per resume event; unsubscribing removes the listener', async () => {
    const cb = vi.fn();
    const stop = createLifecycle().onResume(cb);
    await settle();
    expect(App.addListener).toHaveBeenCalledWith('resume', expect.any(Function));
    fire('resume');
    expect(cb).toHaveBeenCalledTimes(1);
    fire('resume');
    expect(cb).toHaveBeenCalledTimes(2);
    fire('pause');
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
    await settle();
    expect(removed).toContain('resume');
    fire('resume');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('unsubscribing before the plugin registered the listener still ends up with no listener', async () => {
    const cb = vi.fn();
    let resolveHandle!: (h: PluginListenerHandle) => void;
    let registered: (() => void) | null = null;
    const deps = {
      addResumeListener: (fn: () => void) => {
        registered = fn;
        return new Promise<PluginListenerHandle>((r) => {
          resolveHandle = r;
        });
      },
    };
    const stop = createLifecycle(deps).onResume(cb);
    stop();
    const remove = vi.fn(async () => {});
    resolveHandle({ remove });
    await settle();
    expect(remove).toHaveBeenCalledTimes(1);
    registered!();
    expect(cb).toHaveBeenCalledTimes(0);
  });
});

describe('M15: subscribers share one plugin listener', () => {
  it('three subscribers → one App.addListener; each gets every resume; the listener is removed only when the last one leaves', async () => {
    const add = vi.fn(async (cb: () => void): Promise<PluginListenerHandle> => {
      if (!listeners.has('shared')) listeners.set('shared', new Set());
      listeners.get('shared')!.add(cb);
      return { remove: async () => void listeners.get('shared')!.delete(cb) };
    });
    const lifecycle = createLifecycle({ addResumeListener: add });
    const [a, b, c] = [vi.fn(), vi.fn(), vi.fn()];
    const stopA = lifecycle.onResume(a);
    const stopB = lifecycle.onResume(b);
    const stopC = lifecycle.onResume(c);
    await settle();
    expect(add).toHaveBeenCalledTimes(1);
    fire('shared');
    expect([a, b, c].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    stopB();
    stopB(); // idempotent
    fire('shared');
    expect([a, b, c].map((f) => f.mock.calls.length)).toEqual([2, 1, 2]);
    expect(listeners.get('shared')!.size).toBe(1);
    stopA();
    stopC();
    await settle();
    expect(listeners.get('shared')!.size).toBe(0);
    // A new subscriber after everyone left registers again (one more plugin listener).
    lifecycle.onResume(vi.fn());
    await settle();
    expect(add).toHaveBeenCalledTimes(2);
  });
});
