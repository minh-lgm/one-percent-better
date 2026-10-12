// Network state (ARCHITECTURE §3, M6/M7). `navigator.onLine` is a hint only: `true` can still fail.

export interface Connectivity {
  isOnline(): boolean;
  /** Fires on `online`/`offline` and when the tab becomes visible; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createConnectivity(win: Pick<Window, 'addEventListener' | 'removeEventListener'> & { navigator?: { onLine?: boolean } } = window, doc: Document | null = typeof document === 'undefined' ? null : document): Connectivity {
  return {
    isOnline: () => win.navigator?.onLine !== false,
    subscribe(listener) {
      win.addEventListener('online', listener);
      win.addEventListener('offline', listener);
      doc?.addEventListener('visibilitychange', listener);
      return () => {
        win.removeEventListener('online', listener);
        win.removeEventListener('offline', listener);
        doc?.removeEventListener('visibilitychange', listener);
      };
    },
  };
}

/** Always-online stand-in for tests and non-browser contexts. */
export const alwaysOnline: Connectivity = { isOnline: () => true, subscribe: () => () => {} };
