// App lifecycle on native (ARCHITECTURE §5.12): `resume` from @capacitor/app drives the same triggers as
// `visibilitychange → visible` on the web (reminder check, sync).
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
  return {
    onResume(cb) {
      let active = true;
      // The plugin registers asynchronously; an unsubscribe that comes first removes the handle once it lands.
      const handle = deps.addResumeListener(() => {
        if (active) cb();
      });
      return () => {
        active = false;
        void handle.then((h) => h.remove()).catch(() => undefined);
      };
    },
  };
}
