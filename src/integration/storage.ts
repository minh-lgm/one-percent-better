export type PersistState = 'persisted' | 'not-persisted' | 'unsupported';

type StorageLike = { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } | undefined;

/**
 * Ask the browser to protect our storage from automatic eviction (FR-09).
 * Never throws; returns the resulting state for the Settings screen.
 */
export async function requestPersistentStorage(storage: StorageLike = globalThis.navigator?.storage): Promise<PersistState> {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    const granted = await storage.persist();
    return granted ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}

/** Quick capability check used before opening the database. */
export function isIndexedDbAvailable(global: { indexedDB?: unknown } = globalThis): boolean {
  return typeof global.indexedDB !== 'undefined' && global.indexedDB !== null;
}
