// Native sign-in contract (ARCHITECTURE §5.9 v5.0, M14; ADR-36). Implemented by
// `integration/native/social-login.ts` (Google Sign-In / Sign in with Apple through the Capacitor plugin)
// and `test/fake-id-token-provider.ts`. Only exists on the native app; the web build has no provider.
import type { AuthProvider } from './auth-port';

export type IdTokenResult =
  | {
      kind: 'ok';
      /** The provider's ID token (JWT); its `nonce` claim is SHA-256(rawNonce). */
      idToken: string;
      /** The raw nonce the adapter generated; Supabase hashes it and compares with the token claim. */
      rawNonce: string;
      /** Apple only (`useProperTokenExchange`): exchanged by the Edge Function to revoke the token (A-62). */
      authorizationCode?: string;
      /** Apple gives the name once, on the first authorisation (A-60). */
      givenName?: string;
      familyName?: string;
    }
  | { kind: 'cancelled' };

export interface IdTokenProvider {
  /** `google`: both client IDs configured; `apple`: iOS only. */
  available(provider: AuthProvider): boolean;
  /** Shows the native sheet. Resolves `cancelled` when the user dismisses it; throws on any other failure. */
  getIdToken(provider: AuthProvider): Promise<IdTokenResult>;
  /** Forget the provider-side session (sign-out, account deletion). Never throws. */
  logout(provider: AuthProvider): Promise<void>;
}
