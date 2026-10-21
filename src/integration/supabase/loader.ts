// Lazy entry to the Supabase SDK (ADR-18). This file must stay free of static
// `@supabase/*` imports so the SDK lands in its own chunk, loaded only when needed.
import type { CloudConfig } from '../../config/env';
import type { AccountDeletionPort } from '../../services/account-deletion-port';
import type { AuthPort } from '../../services/auth-port';
import type { RemoteStore } from '../../services/remote-store';

/** Storage key used by the SDK client (`auth.storageKey`); fixed so presence can be checked without the SDK. */
export const AUTH_STORAGE_KEY = 'opb-auth';

/**
 * v3.1 (M6-P1): the only `import()` of the SDK chunk. `__OPB_CLOUD__` is a build-time constant
 * (vite.config `define`): `false` in a build without cloud configuration, so the bundler drops the
 * dynamic import and never emits `supabase-client-*.js`; `true` for cloud builds and in Vitest.
 */
function importClient(): Promise<typeof import('./supabase-client')> {
  if (!__OPB_CLOUD__) return Promise.reject(new Error('This build has no cloud configuration (FR-38); the Supabase SDK is not included.'));
  return import('./supabase-client');
}

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

/** Remove only the single-use PKCE code verifiers the SDK left behind (M6-P1); the session stays. */
export function clearPkceVerifiers(storage: (StorageLike & Pick<Storage, 'removeItem'>) | null | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(`${AUTH_STORAGE_KEY}-`) && k.endsWith('code-verifier')) keys.push(k);
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
      pending = importClient()
        .then((m) => m.createSupabaseAuthPort(cloud, storage))
        .catch((e: unknown) => {
          pending = null;
          throw e;
        });
    }
    return pending;
  };
}

/**
 * M7: `() => Promise<RemoteStore>` sharing the SDK client of the auth port (same session, same
 * chunk). The auth loader is awaited first, so the SDK is still loaded exactly once.
 */
export function createRemoteLoader(loadAuth: () => Promise<AuthPort>): () => Promise<RemoteStore> {
  let pending: Promise<RemoteStore> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.all([loadAuth(), importClient()])
        .then(([port, m]) => m.createSupabaseRemoteStore(port))
        .catch((e: unknown) => {
          pending = null;
          throw e;
        });
    }
    return pending;
  };
}

/**
 * v5.0 (M14): `() => Promise<AccountDeletionPort>` sharing the SDK client of the auth port (ARCH §5.16).
 * Same chunk, loaded only when the user confirms the deletion.
 */
export function createAccountDeletionLoader(loadAuth: () => Promise<AuthPort>): () => Promise<AccountDeletionPort> {
  let pending: Promise<AccountDeletionPort> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.all([loadAuth(), importClient()])
        .then(([port, m]) => m.createSupabaseAccountDeletionPort(port))
        .catch((e: unknown) => {
          pending = null;
          throw e;
        });
    }
    return pending;
  };
}
