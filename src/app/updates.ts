import type { ServiceWorkerHandle } from '../integration/sw-register';

/** Tiny external store: "a new version is waiting" + apply it. */
export interface UpdateStore {
  subscribe(listener: () => void): () => void;
  isAvailable(): boolean;
  notify(): void;
  setHandle(handle: ServiceWorkerHandle | null): void;
  apply(): void;
}

export function createUpdateStore(): UpdateStore {
  const listeners = new Set<() => void>();
  let available = false;
  let handle: ServiceWorkerHandle | null = null;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isAvailable: () => available,
    notify() {
      available = true;
      listeners.forEach((l) => l());
    },
    setHandle(h) {
      handle = h;
    },
    apply() {
      handle?.applyUpdate();
    },
  };
}
