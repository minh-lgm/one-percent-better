// Cross-tab exclusive lock (ARCHITECTURE §5.10, FR-46: at most one tab syncs at a time).
// Implemented over the Web Locks API in `integration/web-locks.ts`; tests use fakes.

export type LockOutcome<T> = { status: 'ran'; value: T } | { status: 'busy' };

export interface LockPort {
  /**
   * Run `fn` while holding `name` if the lock is free right now; `busy` when another holder exists.
   * Implementations without a lock primitive run `fn` unconditionally (sync stays correct, only
   * duplicate requests may occur).
   */
  request<T>(name: string, fn: () => Promise<T>): Promise<LockOutcome<T>>;
}

/** Lock that never blocks (no Web Locks support, tests). */
export const noLocks: LockPort = {
  async request(_name, fn) {
    return { status: 'ran', value: await fn() };
  },
};

/** In-memory lock shared by instances of one JS context (tests simulating two tabs). */
export class MemoryLockPort implements LockPort {
  private readonly held = new Set<string>();

  async request<T>(name: string, fn: () => Promise<T>): Promise<LockOutcome<T>> {
    if (this.held.has(name)) return { status: 'busy' };
    this.held.add(name);
    try {
      return { status: 'ran', value: await fn() };
    } finally {
      this.held.delete(name);
    }
  }
}
