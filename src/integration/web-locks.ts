// `LockPort` over the Web Locks API (ARCHITECTURE §5.10, FR-46: one syncing tab at a time).
// Browsers without `navigator.locks` fall back to running unconditionally (still correct: the
// protocol is idempotent, only duplicate requests can happen).
import { noLocks, type LockOutcome, type LockPort } from '../services/lock-port';

type LockManagerLike = {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<T>): Promise<T>;
};

export function createWebLocks(locks: LockManagerLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockManagerLike }).locks): LockPort {
  if (!locks || typeof locks.request !== 'function') return noLocks;
  return {
    async request<T>(name: string, fn: () => Promise<T>): Promise<LockOutcome<T>> {
      try {
        return await locks.request<LockOutcome<T>>(name, { ifAvailable: true }, async (lock) => {
          if (!lock) return { status: 'busy' };
          return { status: 'ran', value: await fn() };
        });
      } catch (e) {
        // The lock manager itself failed (e.g. storage partition issues): behave like "no locks".
        if ((e as { name?: string })?.name === 'SecurityError' || (e as { name?: string })?.name === 'NotSupportedError') return { status: 'ran', value: await fn() };
        throw e;
      }
    },
  };
}
