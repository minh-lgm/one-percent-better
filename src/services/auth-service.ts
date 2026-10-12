import type { KvRepository, LocalDataRepository, Subscribable, SyncMeta } from '../data/repositories';
import { normalizeSyncMeta } from '../data/repositories';
import { fail, ok, type AuthErrorCode, type Result } from '../domain/types';
import type { AuthCallbackParams, AuthPort, AuthSession, ReturnToStore } from './auth-port';

/** Account state machine (ARCHITECTURE §5.3). `lastError` is shown by the Account card (DESIGN A4) until dismissed. */
export type AuthState =
  | { kind: 'unavailable' }
  | { kind: 'signed-out'; lastError?: AuthErrorCode }
  | { kind: 'signing-in' }
  | { kind: 'signed-in'; userId: string; email: string; name: string }
  | { kind: 'expired'; email: string; lastError?: AuthErrorCode };

/** Result of an OAuth round-trip, for toasts (DESIGN F9). Delivered once, even if the UI mounts after it happened. */
export type AuthOutcome = { kind: 'signed-in'; email: string } | { kind: 'error'; code: AuthErrorCode };

export interface AuthServiceDeps {
  /** Lazy SDK loader (ADR-18). Must only be called when a session exists, on sign-in or on the OAuth callback. */
  loadAuth: () => Promise<AuthPort>;
  /** `localStorage['opb-auth']` exists — answered without loading the SDK. */
  storedSession: () => boolean;
  /** Removes the SDK's stored session without the SDK (sign-out while the SDK cannot load). */
  clearStoredSession?: () => void;
  /** Drops leftover PKCE code verifiers (M6-P1) after a callback that never reached the SDK. */
  clearPkceVerifier?: () => void;
  local: LocalDataRepository;
  kv: KvRepository;
  connectivity: { isOnline(): boolean };
  returnTo: ReturnToStore;
  /** `<origin><BASE_URL>?auth=callback` (ADR-19). */
  redirectUrl: string;
}

const authError = (code: AuthErrorCode, message: string) => ({ code, message });

/**
 * Optional Google sign-in (FR-37 … FR-41). Holds no SDK reference until needed; the
 * SDK comes through `loadAuth` (a dynamic import in the integration layer).
 */
export class AuthService {
  private current: AuthState;
  private readonly listeners = new Set<(s: AuthState) => void>();
  private port: AuthPort | null = null;
  private portPromise: Promise<AuthPort> | null = null;
  private signingOut = false;
  private pending: Promise<void> = Promise.resolve();
  /** Signed-in state known from kv when `init({ callbackPending })` deferred to the callback (M7-D2 / M6-D1). */
  private savedBeforeCallback: Extract<AuthState, { kind: 'signed-in' }> | null = null;
  private readonly outcomeListeners = new Set<(o: AuthOutcome) => void>();
  private pendingOutcome: AuthOutcome | null = null;

  constructor(private readonly deps: AuthServiceDeps | null) {
    this.current = deps ? { kind: 'signed-out' } : { kind: 'unavailable' };
  }

  /** Build without cloud configuration (FR-38): every method is a no-op and the state is `unavailable`. */
  static unavailable(): AuthService {
    return new AuthService(null);
  }

  state(): AuthState {
    return this.current;
  }

  isAvailable(): boolean {
    return this.deps !== null;
  }

  currentUserId(): string | null {
    return this.current.kind === 'signed-in' ? this.current.userId : null;
  }

  watch(): Subscribable<AuthState> {
    return {
      subscribe: (onNext) => {
        this.listeners.add(onNext);
        onNext(this.current);
        return () => {
          this.listeners.delete(onNext);
        };
      },
    };
  }

  /**
   * Outcomes of `completeCallback` (sign-in finished or failed). A listener registered after the
   * outcome happened (the UI mounts after bootstrap ran the callback) still receives it once.
   */
  onOutcome(cb: (o: AuthOutcome) => void): () => void {
    this.outcomeListeners.add(cb);
    if (this.pendingOutcome) {
      const o = this.pendingOutcome;
      this.pendingOutcome = null;
      cb(o);
    }
    return () => {
      this.outcomeListeners.delete(cb);
    };
  }

  private emitOutcome(o: AuthOutcome): void {
    if (this.outcomeListeners.size === 0) {
      this.pendingOutcome = o;
      return;
    }
    this.outcomeListeners.forEach((l) => l(o));
  }

  /** Resolves when the background verification started by `init()` (if any) has finished. Tests only. */
  settled(): Promise<void> {
    return this.pending;
  }

  /**
   * Startup (ARCH §5.9): decides the first state from kv `sync` and the stored SDK session,
   * without loading the SDK when there is nothing to verify. With a stored session the saved
   * account is shown immediately and verified in the background (no flash of "signed out").
   */
  async init(options: { callbackPending?: boolean } = {}): Promise<void> {
    if (!this.deps) return;
    const meta = await this.readMeta();
    if (!this.deps.storedSession()) {
      this.set(meta.userId ? { kind: 'expired', email: meta.account?.email ?? '' } : { kind: 'signed-out' });
      return;
    }
    const saved: AuthState | null = meta.userId && meta.account ? { kind: 'signed-in', userId: meta.userId, email: meta.account.email, name: meta.account.name } : null;
    if (options.callbackPending) {
      // An OAuth callback is about to be exchanged, maybe for another account: do not announce (and
      // sync for) the saved account meanwhile (M7-D2). The saved state is only used if the callback
      // fails while the stored session is still there (M6-D1).
      this.savedBeforeCallback = saved?.kind === 'signed-in' ? saved : null;
      this.set({ kind: 'signing-in' });
      return;
    }
    this.set(saved ?? { kind: 'signing-in' });
    this.pending = this.verifyStoredSession(meta);
  }

  private async verifyStoredSession(meta: SyncMeta): Promise<void> {
    try {
      const port = await this.getPort();
      const session = await port.getSession();
      if (session) {
        await this.applySignedIn(session);
        return;
      }
      // Stored session unusable (revoked / refresh rejected). An event may already have moved us.
      if (this.current.kind === 'signed-in' || this.current.kind === 'signing-in') {
        this.set({ kind: 'expired', email: meta.account?.email ?? '' });
      }
    } catch {
      // SDK could not load or verify (e.g. offline before the chunk was cached): keep what we know.
      if (this.current.kind === 'signing-in') {
        this.set(meta.userId && meta.account ? { kind: 'signed-in', userId: meta.userId, email: meta.account.email, name: meta.account.name } : { kind: 'signed-out' });
      }
    }
  }

  /** Step 1 of F9: remember where to come back to, then let the provider take over the page. */
  async signIn(returnTo: string): Promise<Result<void>> {
    if (!this.deps) return fail(authError('AUTH_FAILED', 'cloud is not configured'));
    if (!this.deps.connectivity.isOnline()) {
      this.set(this.withError(await this.idleState(), 'AUTH_OFFLINE'));
      return fail(authError('AUTH_OFFLINE', 'offline'));
    }
    this.deps.returnTo.save(returnTo);
    this.set({ kind: 'signing-in' });
    try {
      const port = await this.getPort();
      await port.signInWithGoogle(this.deps.redirectUrl);
      return ok(undefined);
    } catch (e) {
      this.set(this.withError(await this.idleState(), 'AUTH_FAILED'));
      return fail(authError('AUTH_FAILED', `sign-in could not start: ${String(e)}`));
    }
  }

  /** Step 3 of F9: the page came back with `?auth=callback&code=…` (or `&error=…`). Sets `signing-in` synchronously. */
  completeCallback(cb: AuthCallbackParams): Promise<Result<AuthSession>> {
    if (!this.deps) return Promise.resolve(fail(authError('AUTH_FAILED', 'cloud is not configured')));
    // M6-D1: a stale/replayed callback while a valid session exists must not demote that session.
    const previous = this.current.kind === 'signed-in' ? this.current : this.savedBeforeCallback;
    this.savedBeforeCallback = null;
    const verifying = this.pending;
    this.set({ kind: 'signing-in' });
    const result = this.runCallback(cb, previous, verifying);
    this.pending = result.then(() => undefined);
    return result;
  }

  private async runCallback(cb: AuthCallbackParams, previous: Extract<AuthState, { kind: 'signed-in' }> | null, verifying: Promise<void>): Promise<Result<AuthSession>> {
    if ('error' in cb) {
      const code: AuthErrorCode = cb.error === 'access_denied' ? 'AUTH_CANCELLED' : 'AUTH_FAILED';
      this.deps!.clearPkceVerifier?.();
      this.set(this.withError(await this.failedState(previous, verifying), code));
      this.emitOutcome({ kind: 'error', code });
      return fail(authError(code, `provider returned ${cb.error}: ${cb.description}`));
    }
    try {
      const port = await this.getPort();
      const session = await port.exchangeCode(cb.code);
      await this.applySignedIn(session);
      this.emitOutcome({ kind: 'signed-in', email: session.email });
      return ok(session);
    } catch (e) {
      this.set(this.withError(await this.failedState(previous, verifying), 'AUTH_FAILED'));
      this.emitOutcome({ kind: 'error', code: 'AUTH_FAILED' });
      return fail(authError('AUTH_FAILED', `code exchange failed: ${String(e)}`));
    }
  }

  /**
   * State after a failed callback: the signed-in state we had before, as long as the device still
   * holds the SDK session (M6-D1); otherwise the usual idle state (`expired` / `signed-out`).
   */
  private async failedState(previous: Extract<AuthState, { kind: 'signed-in' }> | null, verifying: Promise<void>): Promise<AuthState> {
    if (previous) {
      await verifying.catch(() => undefined);
      if (this.deps!.storedSession()) {
        if (this.current.kind === 'expired' || this.current.kind === 'signed-out') return this.current;
        return previous;
      }
    }
    return this.idleState();
  }

  /**
   * FR-41. Keep: local data stays, kv `sync.userId`/`account` are cleared (`lastUserId` kept).
   * Remove: `clearUserData()` first (throws → nothing signed out, the dialog can report it).
   * Network problems never block the local sign-out.
   */
  async signOut({ keepData, preserveLastUserId = false }: { keepData: boolean; preserveLastUserId?: boolean }): Promise<Result<void>> {
    if (!this.deps) return fail(authError('AUTH_FAILED', 'cloud is not configured'));
    const meta = await this.readMeta();
    this.signingOut = true;
    try {
      if (!keepData) await this.deps.local.clearUserData();
      else
        await this.deps.kv.update<unknown>('sync', (cur) => {
          const current = normalizeSyncMeta(cur);
          // D5 "Cancel" (M7): the device was never bound to the new account, so the previous one stays.
          const lastUserId = preserveLastUserId ? current.lastUserId : (meta.userId ?? current.lastUserId);
          return { ...current, userId: null, account: null, lastUserId };
        });
      if (this.deps.storedSession() || this.port) {
        try {
          const port = await this.getPort();
          await port.signOut();
        } catch {
          this.deps.clearStoredSession?.();
        }
      }
      this.set({ kind: 'signed-out' });
      return ok(undefined);
    } finally {
      this.signingOut = false;
    }
  }

  /** A4 "Dismiss": forget the last sign-in error. */
  dismissError(): void {
    if ((this.current.kind === 'signed-out' || this.current.kind === 'expired') && this.current.lastError) {
      const { lastError: _dropped, ...rest } = this.current;
      this.set(rest as AuthState);
    }
  }

  // ---- internals ----

  private set(next: AuthState): void {
    this.current = next;
    this.listeners.forEach((l) => l(next));
  }

  private withError(idle: AuthState, lastError: AuthErrorCode): AuthState {
    if (idle.kind === 'expired') return { kind: 'expired', email: idle.email, lastError };
    if (idle.kind === 'signed-in') return idle; // the valid session stands; the toast reports the failed callback
    return { kind: 'signed-out', lastError };
  }

  /** The state to fall back to when nothing is in progress: `expired` while kv still names an account. */
  private async idleState(): Promise<AuthState> {
    const meta = await this.readMeta();
    return meta.userId ? { kind: 'expired', email: meta.account?.email ?? '' } : { kind: 'signed-out' };
  }

  private async readMeta(): Promise<SyncMeta> {
    return normalizeSyncMeta(await this.deps!.kv.get<unknown>('sync'));
  }

  private async applySignedIn(session: AuthSession): Promise<void> {
    await this.deps!.kv.update<unknown>('sync', (cur) => {
      const meta = normalizeSyncMeta(cur);
      // Switching accounts without a sign-out (expired → other Google account): remember who was here (FR-47).
      const lastUserId = meta.userId && meta.userId !== session.userId ? meta.userId : meta.lastUserId;
      return { ...meta, userId: session.userId, account: { email: session.email, name: session.name }, lastUserId };
    });
    this.set({ kind: 'signed-in', userId: session.userId, email: session.email, name: session.name });
  }

  /** M7: REST answered 401/403 → the session is gone (FR-40). Data and kv `sync.account` stay. */
  expire(): void {
    if (this.current.kind !== 'signed-in') return;
    this.set({ kind: 'expired', email: this.current.email });
  }

  private getPort(): Promise<AuthPort> {
    if (this.port) return Promise.resolve(this.port);
    if (!this.portPromise) {
      this.portPromise = this.deps!.loadAuth().then((port) => {
        this.port = port;
        port.onEvent((e) => void this.onPortEvent(e));
        return port;
      });
      this.portPromise.catch(() => {
        this.portPromise = null; // allow a retry later (e.g. back online)
      });
    }
    return this.portPromise;
  }

  private async onPortEvent(e: { type: 'signed-in'; session: AuthSession } | { type: 'signed-out' } | { type: 'session-expired' }): Promise<void> {
    if (this.signingOut) return;
    if (e.type === 'signed-in') {
      if (this.current.kind === 'signing-in') return; // our own exchange applies it with the result
      await this.applySignedIn(e.session);
      return;
    }
    const meta = await this.readMeta();
    if (e.type === 'signed-out' || !meta.userId) {
      // Signed out from another tab (kv already cleared there), or nothing to expire.
      if (this.current.kind !== 'signed-out') this.set({ kind: 'signed-out' });
      return;
    }
    const email = this.current.kind === 'signed-in' ? this.current.email : (meta.account?.email ?? '');
    this.set({ kind: 'expired', email });
  }
}
