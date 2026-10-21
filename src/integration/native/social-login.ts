// Native sign-in adapter (ARCHITECTURE §5.9 v5.0, ADR-36; M14): Google Sign-In and Sign in with Apple through
// `@capgo/capacitor-social-login` 8.7.4. The plugin receives the SHA-256 digest of a fresh random nonce and the
// provider embeds that digest in the ID token's `nonce` claim; Supabase receives the RAW nonce and hashes it
// itself (`signInWithIdToken`). Only this folder may import the plugin (ESLint, ADR-35).
//
// Plugin facts checked against the pinned package (dist/esm/definitions.d.ts, ios/Sources/SocialLoginPlugin):
// - `login({ provider: 'google', options: { nonce } })` → `result.idToken: string | null`, `result.profile.givenName/familyName`
// - `login({ provider: 'apple', options: { scopes, nonce } })` → `result.idToken`, `result.profile.givenName/familyName`,
//   `result.authorizationCode` (only with `apple.useProperTokenExchange: true` at `initialize`)
// - a dismissed sheet rejects with `code === 'USER_CANCELLED'` (iOS: ASAuthorizationError.canceled / GIDSignIn -5 /
//   messages containing "cancel"); other failures reject with a plain message.
import { SocialLogin, type InitializeOptions, type LoginOptions } from '@capgo/capacitor-social-login';
import type { AuthProvider } from '../../services/auth-port';
import type { IdTokenProvider, IdTokenResult } from '../../services/id-token-port';

/** What the plugin returns for the two providers the app uses (narrowed from `LoginResult`). */
export interface PluginLoginResult {
  provider: string;
  result: unknown;
}

export interface SocialLoginPlugin {
  initialize(options: InitializeOptions): Promise<void>;
  login(options: LoginOptions): Promise<PluginLoginResult>;
  logout(options: { provider: 'google' | 'apple' }): Promise<void>;
}

export interface SocialLoginDeps {
  platform: 'ios' | 'android';
  /** Public Google client IDs (`VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_GOOGLE_IOS_CLIENT_ID`); either missing → Google unavailable. */
  googleWebClientId: string | null;
  googleIosClientId: string | null;
  plugin?: SocialLoginPlugin;
  /** Web Crypto (`globalThis.crypto`); injectable for tests. */
  crypto?: Crypto;
}

export const USER_CANCELLED_CODE = 'USER_CANCELLED';
const CANCEL_PATTERN = /cancel|access.denied/i;

const hex = (bytes: ArrayLike<number>): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** 32 random bytes as 64 hex characters (the raw nonce) and its SHA-256 as 64 hex characters (the digest). */
export async function createNonce(crypto: Crypto = globalThis.crypto): Promise<{ raw: string; digest: string }> {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))));
  return { raw, digest };
}

/** The plugin rejects a dismissed sheet with `code: 'USER_CANCELLED'`; older paths only say so in the message. */
export function isUserCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === USER_CANCELLED_CODE) return true;
  return typeof message === 'string' && CANCEL_PATTERN.test(message);
}

const clean = (v: string | null | undefined): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : undefined;
};

export function createSocialLogin(deps: SocialLoginDeps): IdTokenProvider {
  const plugin: SocialLoginPlugin = deps.plugin ?? SocialLogin;
  const crypto = deps.crypto ?? globalThis.crypto;
  const google = deps.googleWebClientId && deps.googleIosClientId ? { webClientId: deps.googleWebClientId, iOSClientId: deps.googleIosClientId } : null;
  const apple = deps.platform === 'ios';
  let initialized: Promise<void> | null = null;

  const available = (provider: AuthProvider): boolean => (provider === 'google' ? google !== null : apple);

  /** `initialize` runs once per app run; a failure is not memoised so the next tap retries. */
  const ensureInitialized = (): Promise<void> => {
    if (!initialized) {
      const options: InitializeOptions = {
        // `iOSServerClientId` = the web client ID, so the ID token's `aud` is the web client ID that Supabase
        // lists first in "Client IDs" (plugin README: needed when the token is verified on a server).
        ...(google ? { google: { webClientId: google.webClientId, iOSClientId: google.iOSClientId, iOSServerClientId: google.webClientId, mode: 'online' as const } } : {}),
        // Apple on iOS needs no client ID (the bundle id is the client); the authorization code lets the Edge
        // Function revoke the token when the account is deleted (A-62).
        ...(apple ? { apple: { useProperTokenExchange: true } } : {}),
      };
      initialized = plugin.initialize(options).catch((e: unknown) => {
        initialized = null;
        throw e;
      });
    }
    return initialized;
  };

  return {
    available,
    async getIdToken(provider) {
      if (!available(provider)) throw new Error(`${provider} sign-in is not available on ${deps.platform}`);
      await ensureInitialized();
      const nonce = await createNonce(crypto);
      let result: PluginLoginResult;
      try {
        result =
          provider === 'google'
            ? await plugin.login({ provider: 'google', options: { nonce: nonce.digest } })
            : await plugin.login({ provider: 'apple', options: { scopes: ['name', 'email'], nonce: nonce.digest } });
      } catch (e) {
        if (isUserCancelled(e)) return { kind: 'cancelled' };
        throw e;
      }
      return toIdTokenResult(result, nonce.raw);
    },
    async logout(provider) {
      try {
        await ensureInitialized();
        await plugin.logout({ provider });
      } catch {
        // Best effort: the account session is already gone; the sheet will simply ask again next time.
      }
    },
  };
}

/** Pick the fields the app needs out of the plugin's response; no ID token = failure (never a session). */
export function toIdTokenResult(result: PluginLoginResult, rawNonce: string): IdTokenResult {
  type Fields = { idToken?: string | null; authorizationCode?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
  const r = (result.result ?? {}) as Fields;
  if (result.provider === 'google') {
    const idToken = clean(r.idToken);
    if (!idToken) throw new Error('Google Sign-In returned no ID token');
    return { kind: 'ok', idToken, rawNonce, ...nameOf(r.profile) };
  }
  if (result.provider === 'apple') {
    const idToken = clean(r.idToken);
    if (!idToken) throw new Error('Sign in with Apple returned no identity token');
    const authorizationCode = clean(r.authorizationCode);
    return { kind: 'ok', idToken, rawNonce, ...(authorizationCode ? { authorizationCode } : {}), ...nameOf(r.profile) };
  }
  throw new Error(`unexpected provider ${String(result.provider)}`);
}

function nameOf(profile: { givenName?: string | null; familyName?: string | null } | undefined): { givenName?: string; familyName?: string } {
  const givenName = clean(profile?.givenName);
  const familyName = clean(profile?.familyName);
  return { ...(givenName ? { givenName } : {}), ...(familyName ? { familyName } : {}) };
}
