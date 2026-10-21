import type { AccountDeletionPort, AccountDeletionResult } from '../services/account-deletion-port';

/** In-memory `AccountDeletionPort` (ARCH §5.16): scripted result, recorded inputs. */
export class FakeAccountDeletionPort implements AccountDeletionPort {
  /** What the next call resolves with; an `Error` rejects (the SDK could not even be called). */
  next: AccountDeletionResult | Error = { kind: 'deleted', appleRevoked: 'not-applicable' };
  calls: Array<{ appleAuthorizationCode?: string }> = [];
  /** Resolves `next` only after this promise (tests that need the call to be in flight). */
  gate: Promise<void> | null = null;

  async deleteAccount(input: { appleAuthorizationCode?: string }): Promise<AccountDeletionResult> {
    this.calls.push({ ...input });
    if (this.gate) await this.gate;
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}
