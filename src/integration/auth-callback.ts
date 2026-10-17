// OAuth callback helpers (ARCHITECTURE §5.9, ADR-19). The callback lands on
// `<BASE_URL>?auth=callback&code=…` (query, before any `#`); the app reads it once,
// replaces the URL with `<BASE_URL>#<returnTo>` and continues on the hash router.
import type { AuthCallbackParams, ReturnToStore } from '../services/auth-port';

export const CALLBACK_PARAM = 'auth';
export const CALLBACK_VALUE = 'callback';
export const RETURN_TO_KEY = 'opb-auth-return';
export const DEFAULT_RETURN_TO = '#/settings';
/** Where the SDK keeps the single-use PKCE code verifier (`<storageKey>-code-verifier`, ADR-19). */
export const PKCE_VERIFIER_KEY = 'opb-auth-code-verifier';

/** `{ code }`, `{ error, description }` or `null` when the URL is not an auth callback. */
export function readAuthCallback(location: { search: string }): AuthCallbackParams | null {
  const params = new URLSearchParams(location.search);
  if (params.get(CALLBACK_PARAM) !== CALLBACK_VALUE) return null;
  const error = params.get('error');
  if (error) return { error, description: params.get('error_description') ?? '' };
  const code = params.get('code');
  if (code) return { code };
  return { error: 'invalid_callback', description: 'callback without code or error' };
}

/** Only hashes of our own router (`#/…`) are accepted as a return target. */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  if (!/^#\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(value)) return null;
  return value;
}

/** Replace the callback URL (query gone, no reload) with `baseUrl + returnTo` so a reload cannot replay the code. */
export function cleanCallbackUrl(history: { replaceState(data: unknown, unused: string, url: string): void }, baseUrl: string, returnTo: string | null): string {
  const target = `${baseUrl}${sanitizeReturnTo(returnTo) ?? DEFAULT_RETURN_TO}`;
  history.replaceState(null, '', target);
  return target;
}

/** `ReturnToStore` on `sessionStorage` (survives the provider round-trip in the same tab). */
export function sessionReturnTo(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): ReturnToStore {
  return {
    save(hash) {
      try {
        storage?.setItem(RETURN_TO_KEY, hash);
      } catch {
        // Storage may be blocked (private mode); the default target is used instead.
      }
    },
    take() {
      try {
        const v = storage?.getItem(RETURN_TO_KEY) ?? null;
        storage?.removeItem(RETURN_TO_KEY);
        return sanitizeReturnTo(v);
      } catch {
        return null;
      }
    },
  };
}

/** `redirectTo` for the provider (no hash, ADR-19): e.g. `https://minh-lgm.github.io/one-percent-better/?auth=callback`. */
export function callbackRedirectUrl(origin: string, baseUrl: string): string {
  return new URL(`${baseUrl}?${CALLBACK_PARAM}=${CALLBACK_VALUE}`, origin).href;
}

/**
 * v3.1 (M6-P1): drop the PKCE code verifier once a callback has settled (signed in, cancelled or
 * failed). It is single-use; the SDK makes a fresh one at the next sign-in. Nothing else is touched.
 */
export function clearPkceVerifier(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(PKCE_VERIFIER_KEY);
  } catch {
    // Storage may be blocked (private mode); nothing to clean then.
  }
}
