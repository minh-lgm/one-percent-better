// The ONLY module (with its tests) that imports @supabase/* (ARCHITECTURE §3, ADR-18).
// Reached exclusively through `loader.ts` (dynamic import) so the SDK is its own chunk.
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { CloudConfig } from '../../config/env';
import { displayName, type AuthEvent, type AuthPort, type AuthSession } from '../../services/auth-port';
import { AUTH_STORAGE_KEY, clearStoredSession } from './loader';

export interface SupabaseClientOptions {
  /** Defaults to `localStorage`; tests pass an in-memory adapter. */
  storage?: Storage | SupportedStorage;
  /** Called with the provider URL instead of navigating (tests). In a browser the SDK navigates itself. */
  navigate?: (url: string) => void;
  fetch?: typeof fetch;
}

/** PKCE, no implicit tokens in the hash, our own callback handling (ADR-19). */
export function createSupabase(cloud: CloudConfig, options: SupabaseClientOptions = {}): SupabaseClient {
  return createClient(cloud.url, cloud.key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
      ...(options.storage ? { storage: options.storage as SupportedStorage } : {}),
    },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}

function toSession(session: Session): AuthSession {
  const email = session.user.email ?? '';
  return { userId: session.user.id, email, name: displayName(session.user.user_metadata as { full_name?: unknown; name?: unknown }, email) };
}

/** Errors the SDK marks as transient network failures (offline, DNS, 5xx retried). */
function isRetryable(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AuthRetryableFetchError';
}

/** `AuthPort` over `supabase.auth` (ARCHITECTURE §5.9). */
export class SupabaseAuthPort implements AuthPort {
  private signingOut = false;
  private exchanging = false;
  private readonly listeners = new Set<(e: AuthEvent) => void>();
  private readonly storage: SupportedStorage | Storage | undefined;

  constructor(
    readonly client: SupabaseClient,
    private readonly options: SupabaseClientOptions = {},
  ) {
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      let mapped: AuthEvent | null = null;
      if (event === 'SIGNED_IN' && session && !this.exchanging) mapped = { type: 'signed-in', session: toSession(session) };
      else if (event === 'SIGNED_OUT') mapped = this.signingOut ? { type: 'signed-out' } : { type: 'session-expired' };
      if (mapped) this.listeners.forEach((l) => l(mapped));
    });
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (data.session) return toSession(data.session);
    if (error && isRetryable(error)) {
      // Offline with an access token past its refresh margin: the SDK kept the stored session; show it (FR-40).
      const stored = await this.readStored();
      return stored ? toSession(stored) : null;
    }
    return null;
  }

  async signInWithGoogle(redirectTo: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, ...(this.options.navigate ? { skipBrowserRedirect: true } : {}) },
    });
    if (error) throw error;
    if (this.options.navigate && data.url) this.options.navigate(data.url);
  }

  async exchangeCode(code: string): Promise<AuthSession> {
    this.exchanging = true;
    try {
      const { data, error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) throw new Error('no session in token response');
      return toSession(data.session);
    } finally {
      this.exchanging = false;
    }
  }

  /** Scope `local`. A failed server call (offline) must still clear the device session. */
  async signOut(): Promise<void> {
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) clearStoredSession(this.storage as Storage);
    } catch {
      clearStoredSession(this.storage as Storage);
    } finally {
      this.signingOut = false;
    }
  }

  onEvent(cb: (e: AuthEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async accessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async readStored(): Promise<Session | null> {
    try {
      const raw = await this.storage?.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Session;
      return parsed && typeof parsed.access_token === 'string' && parsed.user ? parsed : null;
    } catch {
      return null;
    }
  }
}

/** Factory used by `loader.ts`. */
export function createSupabaseAuthPort(cloud: CloudConfig, storage?: Storage | SupportedStorage, options: Omit<SupabaseClientOptions, 'storage'> = {}): AuthPort {
  const client = createSupabase(cloud, { ...options, storage });
  return new SupabaseAuthPort(client, { ...options, storage });
}
