// Lazy entry to the Supabase SDK (ADR-18). This file must stay free of static
// `@supabase/*` imports so the SDK lands in its own chunk, loaded only when needed.
import type { CloudConfig } from '../../config/env';
import type { AuthPort } from '../../services/auth-port';

/** Storage key used by the SDK client (`auth.storageKey`); fixed so presence can be checked without the SDK. */
export const AUTH_STORAGE_KEY = 'opb-auth';

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'key' | 'length'>;

/** `true` when the SDK has a persisted session on this device. Never loads the SDK. */
export function hasStoredSession(storage: StorageLike | null | undefined): boolean {
  try {
    const raw = storage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown };
    return typeof parsed?.access_token === 'string' && typeof parsed?.refresh_token === 'string';
  } catch {
    return false;
  }
}

/** Remove the SDK session and any PKCE verifiers without the SDK (sign-out while it cannot load). */
export function clearStoredSession(storage: (StorageLike & Pick<Storage, 'removeItem'>) | null | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && (k === AUTH_STORAGE_KEY || k.startsWith(`${AUTH_STORAGE_KEY}-`))) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

/**
 * `() => Promise<AuthPort>` that imports `supabase-client` once (memoised; a failed
 * import can be retried). The only `import()` of the SDK chunk in the app.
 */
export function createSupabaseLoader(cloud: CloudConfig, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): () => Promise<AuthPort> {
  let pending: Promise<AuthPort> | null = null;
  return () => {
    if (!pending) {
      pending = import('./supabase-client')
        .then((m) => m.createSupabaseAuthPort(cloud, storage))
        .catch((e: unknown) => {
          pending = null;
          throw e;
        });
    }
    return pending;
  };
}
