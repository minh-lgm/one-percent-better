// App lifecycle on native (ARCHITECTURE §5.12): `resume` from @capacitor/app drives the same triggers as
// `visibilitychange → visible` on the web (reminder check / replan, sync, `useNow`).
// M15: several subscribers (schedulers + every mounted `useNow`) share ONE plugin listener, registered when the
// first subscriber arrives and removed when the last one leaves, so the bridge sees a single `App.addListener`.
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeLifecycle {
  /** Calls `cb` every time the app returns to the foreground; returns the unsubscribe function. */
  onResume(cb: () => void): () => void;
}

export interface LifecycleDeps {
  addResumeListener: (cb: () => void) => Promise<PluginListenerHandle>;
}

const defaultDeps = (): LifecycleDeps => ({
  addResumeListener: (cb) => App.addListener('resume', cb),
});

export function createLifecycle(deps: LifecycleDeps = defaultDeps()): NativeLifecycle {
  const subscribers = new Set<() => void>();
  let handle: Promise<PluginListenerHandle> | null = null;

  const ensureListener = () => {
    if (handle) return;
    // The plugin registers asynchronously; the listener fans out to whoever is subscribed at the time it fires.
    handle = deps.addResumeListener(() => {
      for (const cb of [...subscribers]) cb();
    });
  };
  const dropListener = () => {
    const h = handle;
    handle = null;
    // An unsubscribe that comes before the registration lands removes the handle once it does.
    void h?.then((l) => l.remove()).catch(() => undefined);
  };

  return {
    onResume(cb) {
      subscribers.add(cb);
      ensureListener();
      return () => {
        if (!subscribers.delete(cb)) return;
        if (subscribers.size === 0) dropListener();
      };
    },
  };
}
