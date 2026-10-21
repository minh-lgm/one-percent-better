// Account deletion contract (ARCHITECTURE §5.16, §4.7; M14, FR-61). Implemented by
// `integration/supabase/supabase-client.ts` (`SupabaseAccountDeletionPort`, calls the Edge Function
// `delete-account`) and `test/fake-account-deletion-port.ts`.

export type AppleRevokeResult = 'not-applicable' | 'revoked' | 'manual-required';

export type AccountDeletionResult =
  | { kind: 'deleted'; appleRevoked: AppleRevokeResult }
  /** 5xx, timeout, unexpected body — nothing was deleted (the function deletes in one transaction). */
  | { kind: 'failed' }
  /** 401: the JWT is no longer valid (or the account is already gone). */
  | { kind: 'session-expired' }
  /** The request never reached the function. */
  | { kind: 'offline' };

export interface AccountDeletionPort {
  /** The user is always taken from the session's JWT; the Apple code (if any) lets the function revoke the Apple token. */
  deleteAccount(input: { appleAuthorizationCode?: string }): Promise<AccountDeletionResult>;
}
