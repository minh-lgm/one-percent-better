// Auth contract (ARCHITECTURE §5.9, M6). Implemented by `integration/supabase/supabase-client.ts`
// (real) and `test/fake-auth-port.ts` (tests). Services only see this interface.

/** v5.0 (M14): identity providers an account can carry (ARCHITECTURE §5.9 v5.0). */
export type AuthProvider = 'google' | 'apple';

export interface AuthSession {
  userId: string;
  email: string;
  /** `user_metadata.full_name ?? name ?? part before '@'` (A-21). */
  name: string;
  /** v5.0 (M14): `app_metadata.providers` of the account (Google, Apple, or both when linked by verified email). */
  providers?: AuthProvider[];
}

export type AuthEvent = { type: 'signed-in'; session: AuthSession } | { type: 'signed-out' } | { type: 'session-expired' };

export interface AuthPort {
  /** Reads the stored session; never needs the network. `null` = no usable session. */
  getSession(): Promise<AuthSession | null>;
  /** Full-page navigation to the provider; the promise may never resolve. */
  signInWithGoogle(redirectTo: string): Promise<void>;
  /** PKCE exchange; throws → AUTH_FAILED. */
  exchangeCode(code: string): Promise<AuthSession>;
  /** Scope `local`; clears the stored session even when offline. */
  signOut(): Promise<void>;
  onEvent(cb: (e: AuthEvent) => void): () => void;
  /** For the RemoteStore (same SDK client, M7). */
  accessToken(): Promise<string | null>;
  /**
   * v5.0 (M14, ADR-36): session from a provider ID token obtained natively. `nonce` is the raw nonce whose
   * SHA-256 is the token's `nonce` claim. Throws → AUTH_FAILED.
   */
  signInWithIdToken(input: { provider: AuthProvider; token: string; nonce: string }): Promise<AuthSession>;
  /**
   * v5.0 (M14, A-60): store the name Apple gives only once, when the account has no name yet
   * (`user_metadata.full_name` / `name` empty). An account that already has a name is left alone.
   */
  setDisplayName?(name: string): Promise<void>;
}

/** Where to go back to after the OAuth round-trip (sessionStorage `opb-auth-return`). */
export interface ReturnToStore {
  save(hash: string): void;
  /** Reads and clears. */
  take(): string | null;
}

/** Parameters found on the callback URL `<BASE_URL>?auth=callback&…` (read by `integration/auth-callback.ts`). */
export type AuthCallbackParams = { code: string } | { error: string; description: string };

/** Derive the display name per A-21. */
export function displayName(meta: { full_name?: unknown; name?: unknown } | null | undefined, email: string): string {
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full;
  const name = typeof meta?.name === 'string' ? meta.name.trim() : '';
  if (name) return name;
  return email.split('@')[0] ?? '';
}
