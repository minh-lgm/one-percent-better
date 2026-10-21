import type { KvRepository, LocalDataRepository, Subscribable, SyncMeta } from '../data/repositories';
import { normalizeSyncMeta } from '../data/repositories';
import { fail, ok, type AccountDeleteErrorCode, type AuthErrorCode, type Result } from '../domain/types';
import type { AccountDeletionPort, AppleRevokeResult } from './account-deletion-port';
import type { AuthCallbackParams, AuthPort, AuthProvider, AuthSession, ReturnToStore } from './auth-port';
import type { IdTokenProvider, IdTokenResult } from './id-token-port';

/** Account state machine (ARCHITECTURE §5.3). `lastError` is shown by the Account card (DESIGN A4) until dismissed. */
export type AuthState =
  | { kind: 'unavailable' }
  | { kind: 'signed-out'; lastError?: AuthErrorCode }
  | { kind: 'signing-in' }
  | { kind: 'signed-in'; userId: string; email: string; name: string; providers?: AuthProvider[] }
  | { kind: 'expired'; email: string; lastError?: AuthErrorCode };

/** v5.0 (M14): what `deleteAccount` needs from the sync engine (ARCH §4.7 b). */
export interface AccountDeletionSync {
  pauseForAccountDeletion(): Promise<void>;
  resumeAfterAccountDeletion(): void;
  reset(options: { forgetLastUser: boolean }): Promise<void>;
}

/** v5.0 (M14): result of a successful `deleteAccount` (the UI picks the toast and the Apple panel from it). */
export interface AccountDeleted {
  appleRevoked: AppleRevokeResult;
  /** The deleted account carried an Apple identity (the manual-revocation panel only makes sense then). */
  hadApple: boolean;
  keepData: boolean;
}

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
  /** v5.0 (M14): native sign-in sheets (Google Sign-In / Sign in with Apple); absent on the web. */
  idTokens?: IdTokenProvider;
  /** v5.0 (M14): lazy port for the Edge Function `delete-account` (same chunk as the SDK, ADR-18). */
  loadAccountDeletion?: () => Promise<AccountDeletionPort>;
  /** v5.0 (M14): the sync engine, resolved late (it is built after this service in the container). */
  sync?: () => AccountDeletionSync | null;
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

  /**
   * Step 1 of F9. Web: remember where to come back to, then let the provider take over the page (PKCE redirect,
   * Google only). v5.0 (M14, ADR-36): when a native `IdTokenProvider` offers the provider, the sheet opens in place,
   * the ID token becomes a session through `signInWithIdToken`, and the signed-in steps are the ones the OAuth
   * callback runs (kv account, sync scheduler → prepareFirstSignIn + syncNow('sign-in'), outcome toast).
   */
  async signIn(returnTo: string, provider: AuthProvider = 'google'): Promise<Result<void>> {
    if (!this.deps) return fail(authError('AUTH_FAILED', 'cloud is not configured'));
    if (this.deps.idTokens?.available(provider)) return this.signInNatively(provider);
    if (provider !== 'google') return fail(authError('AUTH_FAILED', `${provider} sign-in is not available on this platform`));
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

  private async signInNatively(provider: AuthProvider): Promise<Result<void>> {
    if (!this.deps!.connectivity.isOnline()) {
      this.set(this.withError(await this.idleState(), 'AUTH_OFFLINE'));
      return fail(authError('AUTH_OFFLINE', 'offline'));
    }
    // M6-D1: a native sign-in started from a valid session must not demote that session when it fails.
    const previous = this.current.kind === 'signed-in' ? this.current : null;
    const verifying = this.pending;
    this.set({ kind: 'signing-in' });
    const result = this.runNativeSignIn(provider, previous, verifying);
    this.pending = result.then(() => undefined);
    return result;
  }

  private async runNativeSignIn(provider: AuthProvider, previous: Extract<AuthState, { kind: 'signed-in' }> | null, verifying: Promise<void>): Promise<Result<void>> {
    const idTokens = this.deps!.idTokens!;
    const failWith = async (code: AuthErrorCode, message: string): Promise<Result<void>> => {
      this.set(this.withError(await this.failedState(previous, verifying), code));
      this.emitOutcome({ kind: 'error', code });
      return fail(authError(code, message));
    };
    let token: Extract<IdTokenResult, { kind: 'ok' }>;
    try {
      const r = await idTokens.getIdToken(provider);
      if (r.kind === 'cancelled') return failWith('AUTH_CANCELLED', `${provider} sheet cancelled`);
      token = r;
    } catch (e) {
      return failWith('AUTH_FAILED', `${provider} sheet failed: ${String(e)}`);
    }
    try {
      const port = await this.getPort();
      let session = await port.signInWithIdToken({ provider, token: token.idToken, nonce: token.rawNonce });
      // A-60: Apple hands the name over once; the port keeps it when the account has no name yet.
      const appleName = provider === 'apple' ? [token.givenName, token.familyName].filter((part) => part && part.trim()).join(' ').trim() : '';
      if (appleName && port.setDisplayName) {
        await port.setDisplayName(appleName);
        session = (await port.getSession()) ?? session;
      }
      await this.applySignedIn(session, provider);
      this.emitOutcome({ kind: 'signed-in', email: session.email });
      return ok(undefined);
    } catch (e) {
      return failWith('AUTH_FAILED', `ID token sign-in failed: ${String(e)}`);
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
      await this.signOutLocally();
      // v5.0 (M14): the native sheet remembers the account too; forget it so the next sign-in asks again.
      if (meta.account?.provider) await this.deps.idTokens?.logout(meta.account.provider);
      this.set({ kind: 'signed-out' });
      return ok(undefined);
    } finally {
      this.signingOut = false;
    }
  }

  /** Drop the SDK session on this device (scope local); a failing SDK call still clears the stored session. */
  private async signOutLocally(): Promise<void> {
    if (!(this.deps!.storedSession() || this.port)) return;
    try {
      const port = await this.getPort();
      await port.signOut();
    } catch {
      this.deps!.clearStoredSession?.();
    }
  }

  /**
   * v5.0 (M14, FR-61; ARCH §4.7 b): delete the account through the Edge Function, then leave the device as
   * after a sign-out (keep or remove the local data). The device forgets the account entirely (A-61).
   * Failures leave everything as it was: still signed in, local data untouched, sync resumed.
   */
  async deleteAccount({ keepData }: { keepData: boolean }): Promise<Result<AccountDeleted>> {
    const err = (code: AccountDeleteErrorCode | 'AUTH_FAILED', message: string) => fail({ code, message });
    if (!this.deps || !this.deps.loadAccountDeletion) return err('AUTH_FAILED', 'account deletion is not available');
    const state = this.current;
    if (state.kind === 'expired') return err('ACCOUNT_DELETE_SESSION_EXPIRED', 'session expired');
    if (state.kind !== 'signed-in') return err('AUTH_FAILED', `cannot delete the account while ${state.kind}`);
    if (!this.deps.connectivity.isOnline()) return err('ACCOUNT_DELETE_OFFLINE', 'offline');

    // 2. Apple: the user confirms with Apple again so the function can revoke the token (authorization code, 5 min).
    const hadApple = state.providers?.includes('apple') ?? false;
    let appleAuthorizationCode: string | undefined;
    if (hadApple && this.deps.idTokens?.available('apple')) {
      try {
        const r = await this.deps.idTokens.getIdToken('apple');
        if (r.kind === 'cancelled') return err('ACCOUNT_DELETE_CANCELLED', 'Apple confirmation cancelled');
        appleAuthorizationCode = r.authorizationCode;
      } catch (e) {
        return err('ACCOUNT_DELETE_FAILED', `Apple confirmation failed: ${String(e)}`);
      }
    }

    // 3. Nothing may be pushed from now on.
    const sync = this.deps.sync?.() ?? null;
    await sync?.pauseForAccountDeletion();

    // 4. The function (the user comes from the JWT; the SDK attaches it).
    let outcome: Awaited<ReturnType<AccountDeletionPort['deleteAccount']>>;
    try {
      const port = await this.deps.loadAccountDeletion();
      outcome = await port.deleteAccount(appleAuthorizationCode ? { appleAuthorizationCode } : {});
    } catch (e) {
      sync?.resumeAfterAccountDeletion();
      return err('ACCOUNT_DELETE_FAILED', `delete-account could not be called: ${String(e)}`);
    }
    if (outcome.kind !== 'deleted') {
      sync?.resumeAfterAccountDeletion();
      if (outcome.kind === 'session-expired') return err('ACCOUNT_DELETE_SESSION_EXPIRED', 'HTTP 401 from delete-account');
      if (outcome.kind === 'offline') return err('ACCOUNT_DELETE_OFFLINE', 'delete-account unreachable');
      return err('ACCOUNT_DELETE_FAILED', 'delete-account failed');
    }

    // 5. The account is gone: local sign-out, forget the device binding (A-61), optionally wipe the data.
    const provider = (await this.readMeta()).account?.provider;
    this.signingOut = true;
    try {
      await this.signOutLocally();
      if (provider) await this.deps.idTokens?.logout(provider);
      if (sync) await sync.reset({ forgetLastUser: true });
      else await this.deps.kv.update<unknown>('sync', (cur) => ({ ...normalizeSyncMeta(cur), userId: null, account: null, lastUserId: null }));
      if (!keepData) await this.deps.local.clearUserData();
      this.set({ kind: 'signed-out' });
    } finally {
      this.signingOut = false;
    }
    return ok({ appleRevoked: outcome.appleRevoked, hadApple, keepData });
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

  private async applySignedIn(session: AuthSession, provider?: AuthProvider): Promise<void> {
    await this.deps!.kv.update<unknown>('sync', (cur) => {
      const meta = normalizeSyncMeta(cur);
      // Switching accounts without a sign-out (expired → other Google account): remember who was here (FR-47).
      const lastUserId = meta.userId && meta.userId !== session.userId ? meta.userId : meta.lastUserId;
      // v5.0: the native provider used to sign in is kept so sign-out can forget it too; a verification keeps the stored one.
      const kept = provider ?? (meta.userId === session.userId ? meta.account?.provider : undefined);
      return { ...meta, userId: session.userId, account: { email: session.email, name: session.name, ...(kept ? { provider: kept } : {}) }, lastUserId };
    });
    this.set({ kind: 'signed-in', userId: session.userId, email: session.email, name: session.name, ...(session.providers ? { providers: session.providers } : {}) });
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
