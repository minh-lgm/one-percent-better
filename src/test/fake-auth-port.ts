import type { AuthEvent, AuthPort, AuthSession, ReturnToStore } from '../services/auth-port';

export const USER1: AuthSession = { userId: '00000000-0000-4000-8000-000000000001', email: 'minh.test@example.com', name: 'Minh Test' };
export const USER2: AuthSession = { userId: '00000000-0000-4000-8000-000000000002', email: 'other.user@example.com', name: 'Other User' };

/** In-memory `AuthPort` for service/component tests (ARCHITECTURE §8). */
export class FakeAuthPort implements AuthPort {
  session: AuthSession | null = null;
  /** What `exchangeCode` resolves with; an `Error` makes it reject. */
  exchangeResult: AuthSession | Error = USER1;
  /** When set, `signInWithGoogle` rejects. */
  signInError: Error | null = null;
  signOutError: Error | null = null;
  calls = { getSession: 0, signIn: 0, exchange: 0, signOut: 0 };
  lastRedirectTo: string | null = null;
  lastCode: string | null = null;
  private readonly listeners = new Set<(e: AuthEvent) => void>();

  async getSession(): Promise<AuthSession | null> {
    this.calls.getSession += 1;
    return this.session;
  }

  async signInWithGoogle(redirectTo: string): Promise<void> {
    this.calls.signIn += 1;
    this.lastRedirectTo = redirectTo;
    if (this.signInError) throw this.signInError;
  }

  async exchangeCode(code: string): Promise<AuthSession> {
    this.calls.exchange += 1;
    this.lastCode = code;
    if (this.exchangeResult instanceof Error) throw this.exchangeResult;
    this.session = this.exchangeResult;
    return this.exchangeResult;
  }

  async signOut(): Promise<void> {
    this.calls.signOut += 1;
    this.session = null;
    if (this.signOutError) throw this.signOutError;
  }

  onEvent(cb: (e: AuthEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async accessToken(): Promise<string | null> {
    return this.session ? `token-${this.session.userId}` : null;
  }

  /** Simulate an SDK event (expiry, another tab signing in/out). */
  emit(e: AuthEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}

/** In-memory `ReturnToStore`. */
export class MemoryReturnTo implements ReturnToStore {
  value: string | null = null;
  save(hash: string): void {
    this.value = hash;
  }
  take(): string | null {
    const v = this.value;
    this.value = null;
    return v;
  }
}

/** Fake `localStorage['opb-auth']` presence + a loader that counts calls (M6-AC5). */
export function fakeAuthLoader(port: FakeAuthPort = new FakeAuthPort(), options: { stored?: boolean; failLoad?: boolean } = {}) {
  const state = { stored: options.stored ?? false, loads: 0, cleared: 0 };
  return {
    port,
    state,
    loadAuth: async (): Promise<AuthPort> => {
      state.loads += 1;
      if (options.failLoad) throw new Error('chunk failed to load');
      return port;
    },
    storedSession: () => state.stored,
    clearStoredSession: () => {
      state.stored = false;
      state.cleared += 1;
    },
  };
}
