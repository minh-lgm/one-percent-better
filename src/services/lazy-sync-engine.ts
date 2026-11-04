// Lazy front of the sync engine (M18, ARCH §10 "lazy sync", ADR-18 spirit): the UI, the scheduler and the auth
// service talk to this object from the first render, while `SyncService` + `DexieSyncStore` (and the remote side)
// are `import()`ed by the container only when the account can actually sync — a stored session at startup, or the
// user signing in. Until then the cold load of `#/today` carries none of the engine. Before the engine is loaded the
// status is the same `paused / 0 / null` a fresh `SyncService` reports; status, event and merge-prompt subscribers
// are re-attached to the real engine the moment it arrives. Only `import type` of the engine here (lint-enforced).
import type { Subscribable } from '../data/repositories';
import type { SyncStatus } from '../domain/sync';
import type { FirstSignInDecision, MergePrompt, SyncEvent, SyncOutcome, SyncReason, SyncService } from './sync-service';

/** The public surface of `SyncService` the rest of the app uses (UI, scheduler, AuthService, tests). */
export type SyncEngine = Pick<
  SyncService,
  | 'current'
  | 'watchStatus'
  | 'onEvent'
  | 'watchMergePrompt'
  | 'start'
  | 'stop'
  | 'prepareFirstSignIn'
  | 'handleSignedIn'
  | 'willAnnounceMerge'
  | 'confirmMerge'
  | 'cancelMerge'
  | 'finalSyncBeforeSignOut'
  | 'reset'
  | 'pause'
  | 'countRejected'
  | 'pauseForAccountDeletion'
  | 'resumeAfterAccountDeletion'
  | 'isPausedForDeletion'
  | 'syncNow'
>;

const PAUSED: SyncStatus = { kind: 'paused', pending: 0, lastSyncedAt: null };

export class LazySyncEngine implements SyncEngine {
  private engine: SyncService | null = null;
  private loading: Promise<SyncService> | null = null;
  private started = false;
  private status: SyncStatus = PAUSED;
  private prompt: MergePrompt | null = null;
  /**
   * M18-D1 (FR-47, A-27): a sign-in whose decision could not be taken because the engine failed to load. It is settled
   * (`engine.handleSignedIn` → D5 prompt or merge) the moment the engine arrives, before any cycle runs, so a load
   * failure can never turn into a silent upload of another account's data.
   */
  private pendingSignIn: { userId: string; email: string } | null = null;
  private readonly statusListeners = new Set<(s: SyncStatus) => void>();
  private readonly eventListeners = new Set<(e: SyncEvent) => void>();
  private readonly promptListeners = new Set<(p: MergePrompt | null) => void>();
  constructor(private readonly loader: () => Promise<SyncService>) {}

  /** Load the engine (memoised; a failed load is retried on the next call). */
  load(): Promise<SyncService> {
    if (this.engine) return Promise.resolve(this.engine);
    this.loading ??= this.loader()
      .then((engine) => this.attach(engine))
      .catch((e: unknown) => {
        this.loading = null;
        throw e;
      });
    return this.loading;
  }

  /** The engine when it is already loaded (tests, diagnostics). */
  loaded(): SyncService | null {
    return this.engine;
  }

  /** Forward status, events and the merge prompt for good (in-memory listeners; the DB watchers live in `engine.start()`). */
  private attach(engine: SyncService): SyncService {
    this.engine = engine;
    engine.watchStatus().subscribe((s) => {
      this.status = s;
      this.statusListeners.forEach((l) => l(s));
    });
    engine.onEvent((e) => this.eventListeners.forEach((l) => l(e)));
    engine.watchMergePrompt().subscribe((p) => {
      this.prompt = p;
      this.promptListeners.forEach((l) => l(p));
    });
    if (!this.started) engine.stop();
    return engine;
  }

  /** `fn` on the engine once it is there; `fallback` when it is neither loaded nor loading (never triggers a load). */
  private whenLoaded<T>(fn: (engine: SyncService) => Promise<T> | T, fallback: T): Promise<T> {
    if (this.engine) return Promise.resolve(fn(this.engine));
    if (this.loading) return this.loading.then(fn, () => fallback);
    return Promise.resolve(fallback);
  }

  /** The engine could not be loaded (offline before the chunk was cached): report it like an unreachable cloud. */
  private loadFailed(): SyncOutcome {
    this.status = { ...this.status, kind: 'error', error: 'SYNC_UNREACHABLE' };
    this.statusListeners.forEach((l) => l(this.status));
    return { status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' };
  }

  // ---- observation (no load) ----

  current(): SyncStatus {
    return this.engine ? this.engine.current() : this.status;
  }

  watchStatus(): Subscribable<SyncStatus> {
    return {
      subscribe: (onNext) => {
        this.start();
        this.statusListeners.add(onNext);
        onNext(this.current());
        return () => {
          this.statusListeners.delete(onNext);
        };
      },
    };
  }

  onEvent(cb: (e: SyncEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => {
      this.eventListeners.delete(cb);
    };
  }

  watchMergePrompt(): Subscribable<MergePrompt | null> {
    return {
      subscribe: (onNext) => {
        this.promptListeners.add(onNext);
        onNext(this.prompt);
        return () => {
          this.promptListeners.delete(onNext);
        };
      },
    };
  }

  /** Subscribe the engine to the pending count and kv bookkeeping (idempotent; applied when the engine arrives). */
  start(): void {
    this.started = true;
    this.engine?.start();
  }

  stop(): void {
    this.started = false;
    this.engine?.stop();
  }

  // ---- account lifecycle: these load the engine (a session exists or is being created) ----

  prepareFirstSignIn(userId: string): Promise<FirstSignInDecision> {
    return this.load().then((e) => e.prepareFirstSignIn(userId));
  }

  async handleSignedIn(userId: string, email: string): Promise<FirstSignInDecision> {
    this.pendingSignIn = { userId, email };
    let engine: SyncService;
    try {
      engine = await this.load();
    } catch {
      // Undecided: the sign-in stays pending (settled by the next successful load, see `settleSignIn`) and the engine
      // is in error. 'confirm-merge' is the only safe answer — nothing may be uploaded until the real decision is taken.
      this.loadFailed();
      return 'confirm-merge';
    }
    return this.settleSignIn(engine, userId, email);
  }

  /**
   * Run the engine's sign-in handling for the pending sign-in (if it is still the one asked for) and clear it. Called by
   * `handleSignedIn` itself and by `syncNow` after a load that followed a failed one, so the D5 decision always precedes
   * the first cycle.
   */
  private async settleSignIn(engine: SyncService, userId?: string, email?: string): Promise<FirstSignInDecision> {
    const pending = this.pendingSignIn;
    if (!pending || (userId !== undefined && pending.userId !== userId)) return 'same-user';
    this.pendingSignIn = null;
    return engine.handleSignedIn(pending.userId, email ?? pending.email);
  }

  willAnnounceMerge(): Promise<boolean> {
    return this.whenLoaded((e) => e.willAnnounceMerge(), false);
  }

  confirmMerge(): Promise<SyncOutcome> {
    return this.whenLoaded((e) => e.confirmMerge(), { status: 'skipped', why: 'paused' } as SyncOutcome);
  }

  cancelMerge(): void {
    this.engine?.cancelMerge();
  }

  finalSyncBeforeSignOut(): Promise<{ pending: number }> {
    return this.whenLoaded((e) => e.finalSyncBeforeSignOut(), { pending: 0 });
  }

  reset(options?: { forgetLastUser?: boolean }): Promise<void> {
    this.pendingSignIn = null;
    return this.whenLoaded((e) => e.reset(options), undefined);
  }

  pause(): void {
    this.pendingSignIn = null;
    this.engine?.pause();
  }

  countRejected(): Promise<number> {
    return this.whenLoaded((e) => e.countRejected(), 0);
  }

  pauseForAccountDeletion(waitMs?: number): Promise<void> {
    return this.whenLoaded((e) => e.pauseForAccountDeletion(waitMs), undefined);
  }

  resumeAfterAccountDeletion(): void {
    this.engine?.resumeAfterAccountDeletion();
  }

  isPausedForDeletion(): boolean {
    return this.engine?.isPausedForDeletion() ?? false;
  }

  async syncNow(reason: SyncReason): Promise<SyncOutcome> {
    let engine: SyncService;
    try {
      engine = await this.load();
    } catch {
      return this.loadFailed();
    }
    if (this.pendingSignIn) {
      // M18-D1: a sign-in handled while the engine could not load. Decide it first (D5 / merge / same user); when the
      // user has to be asked, nothing runs until they answer (`awaiting-merge`).
      const decision = await this.settleSignIn(engine);
      if (decision === 'confirm-merge') return { status: 'skipped', why: 'awaiting-merge' };
    }
    return engine.syncNow(reason);
  }
}
