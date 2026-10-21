// Sync engine (ARCHITECTURE §5.3, §5.10; FR-45 … FR-50, FR-55; ADR-20/21/24/25). One cycle:
// push dirty rows → read the canonical rows back → pull by keyset cursor → tombstone orphans →
// preferences (push dirty groups or pull) → bookkeeping. Errors become a `SyncStatus`, never
// exceptions. Single-flight inside the tab, `LockPort` (Web Locks) across tabs.
import { PULL_RESET_VERSION } from '../config/constants';
import type { KvRepository, LocalDataRepository, LocalSyncStore, PullCursor, Subscribable, SyncedPrefsRepository, SyncMeta } from '../data/repositories';
import { normalizeSyncMeta } from '../data/repositories';
import { backoffMs, rewindCursor, type SyncErrorCode, type SyncStatus } from '../domain/sync';
import type { Locale } from '../i18n/types';
import type { LockPort } from './lock-port';
import { isRemoteError, rejectedCount, type RemoteStore, type RemoteTable } from './remote-store';

export type SyncReason = 'sign-in' | 'startup' | 'online' | 'visible' | 'change' | 'interval' | 'manual' | 'retry' | 'sign-out' | 'rerun';

export type SyncOutcome =
  | { status: 'ran'; ok: true }
  | { status: 'ran'; ok: false; error: SyncErrorCode }
  | { status: 'skipped'; why: 'busy' | 'paused' | 'backoff' | 'offline' | 'awaiting-merge' | 'aborted' };

export type FirstSignInDecision = 'merge-silently' | 'confirm-merge' | 'same-user';

/** D5 data (DESIGN F11): shown until the user decides; nothing is uploaded meanwhile. */
export interface MergePrompt {
  userId: string;
  email: string;
  goals: number;
  entries: number;
}

export type SyncEvent =
  | { type: 'merge-done'; goals: number; entries: number }
  | { type: 'prefs-applied'; reminderChanged: boolean; localeChanged: Locale | null };

export interface SyncServiceDeps {
  local: LocalSyncStore;
  prefs: SyncedPrefsRepository;
  localData: LocalDataRepository;
  /** Lazy: the SDK chunk is only loaded on the first cycle (ADR-18). */
  loadRemote: () => Promise<RemoteStore>;
  kv: KvRepository;
  auth: {
    currentUserId(): string | null;
    /** Resolves once the stored session has been verified (no request with a stale token). */
    ready?(): Promise<void>;
    /** REST answered 401/403: the session is gone (FR-40). */
    onUnauthorized?(): void;
  };
  locks: LockPort;
  clock?: () => Date;
  connectivity?: { isOnline(): boolean };
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
  /** Rows per push/pull batch (≤ 500, ARCHITECTURE §5.10). */
  batchSize?: number;
  /** Push batches per cycle; the rest waits for the next cycle. */
  maxPushBatches?: number;
  /** Final sync before signing out gives up after this long. */
  signOutTimeoutMs?: number;
}

export const SYNC_LOCK_NAME = 'opb-sync';

interface CycleContext {
  userId: string;
  generation: number;
}

class SyncAborted extends Error {
  constructor() {
    super('sync aborted: account context changed');
    this.name = 'SyncAborted';
  }
}
const DEFAULT_BATCH = 500;
const DEFAULT_MAX_PUSH_BATCHES = 20;
const DEFAULT_SIGN_OUT_TIMEOUT_MS = 10_000;
/** v5.0 (M14, ARCH §4.7 b.3): a cycle still running when the account is being deleted is waited for at most this long. */
const DEFAULT_DELETION_WAIT_MS = 10_000;
/** Reasons that run even while a retry is pending (manual, network back, the retry itself, sign-in/out, startup). */
const BYPASS_BACKOFF: ReadonlySet<SyncReason> = new Set(['manual', 'online', 'retry', 'sign-in', 'sign-out', 'startup', 'rerun']);

export class SyncService {
  private status: SyncStatus = { kind: 'paused', pending: 0, lastSyncedAt: null };
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private readonly eventListeners = new Set<(e: SyncEvent) => void>();
  private readonly promptListeners = new Set<(p: MergePrompt | null) => void>();
  private mergePrompt: MergePrompt | null = null;
  private firstSignIn: Promise<boolean> | null = null;
  /**
   * Bumped whenever the account context changes (sign-in handled, merge confirmed, pause, reset). A running
   * cycle re-checks it (and the current user id) before every remote request and local write, and aborts
   * instead of acting for the wrong account (M7-D2).
   */
  private generation = 0;
  private running: Promise<SyncOutcome> | null = null;
  private rerun = false;
  private failures = 0;
  /** Rows the cloud refused during the current cycle (M7-D5: told apart from rows skipped on pull). */
  private cycleRejected = 0;
  private retryTimer: unknown = null;
  private started = false;
  /** v5.0 (M14): set while the account is being deleted; every `syncNow` is skipped (nothing may be pushed any more). */
  private deleting = false;
  private stopPending: (() => void) | null = null;
  private stopMeta: (() => void) | null = null;
  private remote: RemoteStore | null = null;
  private readonly clock: () => Date;
  private readonly timers: NonNullable<SyncServiceDeps['timers']>;
  private readonly batchSize: number;
  private readonly maxPushBatches: number;

  constructor(private readonly deps: SyncServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };
    this.batchSize = Math.min(deps.batchSize ?? DEFAULT_BATCH, DEFAULT_BATCH);
    this.maxPushBatches = deps.maxPushBatches ?? DEFAULT_MAX_PUSH_BATCHES;
  }

  // ---- observation ----

  current(): SyncStatus {
    return this.status;
  }

  watchStatus(): Subscribable<SyncStatus> {
    return {
      subscribe: (onNext) => {
        this.start();
        this.listeners.add(onNext);
        onNext(this.status);
        return () => {
          this.listeners.delete(onNext);
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
        onNext(this.mergePrompt);
        return () => {
          this.promptListeners.delete(onNext);
        };
      },
    };
  }

  /** Subscribe to the pending count and the stored bookkeeping (idempotent). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopPending = this.deps.local.watchPendingCount().subscribe((pending) => this.set({ pending }), () => undefined);
    this.stopMeta = this.deps.kv.watch<unknown>('sync').subscribe((raw) => {
      const meta = normalizeSyncMeta(raw);
      if (meta.lastSyncedAt !== this.status.lastSyncedAt) this.set({ lastSyncedAt: meta.lastSyncedAt });
    }, () => undefined);
  }

  stop(): void {
    this.stopPending?.();
    this.stopMeta?.();
    this.stopPending = null;
    this.stopMeta = null;
    this.started = false;
    this.clearRetry();
  }

  // ---- account lifecycle ----

  /**
   * FR-47 / A-27: `merge-silently` on a device never bound to another account, `same-user` when the
   * last account on this device is this one, `confirm-merge` when it was a different one and the
   * device still holds data (D5; nothing is uploaded until `confirmMerge`).
   */
  async prepareFirstSignIn(userId: string): Promise<FirstSignInDecision> {
    const meta = await this.readMeta();
    const previous = meta.lastUserId;
    if (previous === userId) return 'same-user';
    if (previous !== null) {
      const live = await this.deps.localData.countLive();
      if (live.goals + live.entries > 0) return 'confirm-merge';
    }
    return 'merge-silently';
  }

  /**
   * Called once per sign-in (scheduler). Either syncs right away (and reports the merge) or raises
   * the D5 prompt. Returns the decision.
   */
  async handleSignedIn(userId: string, email: string): Promise<FirstSignInDecision> {
    this.generation += 1; // a cycle still running for the previous account must not touch this one (M7-D2)
    // `willAnnounceMerge()` resolves `true` only once the merge cycle has really pushed the device data
    // (M7-D4: a failed first cycle shows the plain "Signed in" toast instead of nothing).
    let announce: (v: boolean) => void = () => undefined;
    this.firstSignIn = new Promise<boolean>((resolve) => {
      announce = resolve;
    });
    try {
      const decision = await this.prepareFirstSignIn(userId);
      const merged = decision === 'merge-silently' && (await this.deps.local.countDirty()) > 0;
      if (!merged) announce(false);
      if (decision === 'confirm-merge') {
        const live = await this.deps.localData.countLive();
        this.setPrompt({ userId, email, goals: live.goals, entries: live.entries });
        this.set({ kind: 'paused', error: undefined, nextRetryAt: undefined });
        return decision;
      }
      await this.bindUser(userId, decision === 'merge-silently');
      const outcome = await this.syncNow('sign-in');
      const ok = outcome.status === 'ran' && outcome.ok;
      if (merged && ok) {
        const live = await this.deps.localData.countLive();
        this.emit({ type: 'merge-done', goals: live.goals, entries: live.entries });
      }
      announce(merged && ok);
      return decision;
    } finally {
      announce(false);
    }
  }

  /**
   * `true` when the sign-in being handled merges device data silently, i.e. a `merge-done` event
   * ("Signed in. Your account now has …") will follow and the plain "Signed in" toast is redundant
   * (DESIGN F11). `false` when no sign-in is being handled.
   */
  willAnnounceMerge(): Promise<boolean> {
    return this.firstSignIn ?? Promise.resolve(false);
  }

  /** D5 "Add to account": every live row and chosen preference group is pushed to the new account. */
  async confirmMerge(): Promise<SyncOutcome> {
    const prompt = this.mergePrompt;
    if (!prompt) return { status: 'skipped', why: 'paused' };
    this.generation += 1;
    await this.deps.local.markAllDirty();
    await this.deps.prefs.markAllDirty();
    await this.bindUser(prompt.userId, true);
    this.setPrompt(null);
    const outcome = await this.syncNow('sign-in');
    if (outcome.status === 'ran' && outcome.ok) {
      const live = await this.deps.localData.countLive();
      this.emit({ type: 'merge-done', goals: live.goals, entries: live.entries });
    }
    return outcome;
  }

  /** D5 "Cancel": forget the prompt; the caller signs out keeping `lastUserId` (so the question comes back next time). */
  cancelMerge(): void {
    this.setPrompt(null);
  }

  /** Before sign-out (FR-41): one last cycle when online, bounded in time; reports what is still waiting. */
  async finalSyncBeforeSignOut(): Promise<{ pending: number }> {
    if (this.deps.connectivity && !this.deps.connectivity.isOnline()) return { pending: await this.deps.local.countDirty() };
    if (this.mergePrompt) return { pending: await this.deps.local.countDirty() };
    const timeoutMs = this.deps.signOutTimeoutMs ?? DEFAULT_SIGN_OUT_TIMEOUT_MS;
    let timer: unknown = null;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = this.timers.setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      await Promise.race([this.syncNow('sign-out'), timeout]);
    } finally {
      if (timer !== null) this.timers.clearTimeout(timer);
    }
    return { pending: await this.deps.local.countDirty() };
  }

  /**
   * After sign-out: forget cursors and bookkeeping (`lastUserId` is kept by AuthService). When the
   * kv row is already gone (Sign out → Remove ran `clearUserData`), nothing is written back.
   * v5.0 (M14, A-61): `forgetLastUser` — the account was deleted, so the device is no longer bound to it
   * (`lastUserId` cleared; the next sign-in merges silently instead of asking D5 about a dead account).
   */
  async reset({ forgetLastUser = false }: { forgetLastUser?: boolean } = {}): Promise<void> {
    this.clearRetry();
    this.failures = 0;
    this.generation += 1;
    this.deleting = false;
    this.setPrompt(null);
    this.firstSignIn = null;
    if ((await this.deps.kv.get<unknown>('sync')) != null) {
      await this.deps.kv.update<unknown>('sync', (cur) => {
        const meta = normalizeSyncMeta(cur);
        return { ...meta, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null, ...(forgetLastUser ? { userId: null, account: null, lastUserId: null } : {}) };
      });
    }
    this.set({ kind: 'paused', error: undefined, nextRetryAt: undefined, remoteInvalid: undefined, remoteSkipped: undefined, rejected: undefined, lastSyncedAt: null });
  }

  /**
   * v5.0 (M14, ARCH §4.7 b.3): the account is about to be deleted. From now on every `syncNow` is skipped
   * (`paused`), retries stop, and a cycle that is still running is waited for (bounded) so nothing lands in
   * the cloud after the deletion request. `resumeAfterAccountDeletion()` undoes it when the deletion fails.
   */
  async pauseForAccountDeletion(waitMs = DEFAULT_DELETION_WAIT_MS): Promise<void> {
    this.deleting = true;
    this.clearRetry();
    this.generation += 1;
    if (this.running) {
      let timer: unknown = null;
      const timeout = new Promise<void>((resolve) => {
        timer = this.timers.setTimeout(resolve, waitMs);
      });
      try {
        await Promise.race([this.running.then(() => undefined, () => undefined), timeout]);
      } finally {
        if (timer !== null) this.timers.clearTimeout(timer);
      }
    }
    this.set({ kind: 'paused', error: undefined, nextRetryAt: undefined });
  }

  /** The deletion failed: the account still exists, sync may run again. */
  resumeAfterAccountDeletion(): void {
    this.deleting = false;
  }

  /** Tests / UI: `true` between `pauseForAccountDeletion` and `reset` / `resumeAfterAccountDeletion`. */
  isPausedForDeletion(): boolean {
    return this.deleting;
  }

  /** Rows on this device the cloud refused (`dirty = 2`), read fresh (D4 warns about them, M7-D5). */
  countRejected(): Promise<number> {
    return this.deps.local.countRejected();
  }

  /** Session expired (FR-40): keep everything, stop retrying. */
  pause(): void {
    this.clearRetry();
    this.generation += 1;
    this.set({ kind: 'paused', nextRetryAt: undefined });
  }

  // ---- the cycle ----

  syncNow(reason: SyncReason): Promise<SyncOutcome> {
    if (this.running) {
      if (reason === 'manual' || reason === 'sign-out' || reason === 'sign-in') {
        const after = this.running.then(() => this.syncNow(reason));
        return after;
      }
      this.rerun = true;
      return Promise.resolve({ status: 'skipped', why: 'busy' });
    }
    const run = this.guardedCycle(reason).finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        void this.syncNow('rerun');
      }
    });
    this.running = run;
    return run;
  }

  private async guardedCycle(reason: SyncReason): Promise<SyncOutcome> {
    const userId = this.deps.auth.currentUserId();
    if (this.deleting) return { status: 'skipped', why: 'paused' };
    if (!userId) {
      this.set({ kind: 'paused' });
      return { status: 'skipped', why: 'paused' };
    }
    if (this.mergePrompt) return { status: 'skipped', why: 'awaiting-merge' };
    if (this.deps.connectivity && !this.deps.connectivity.isOnline()) {
      this.set({ kind: 'offline', error: undefined });
      return { status: 'skipped', why: 'offline' };
    }
    if (!BYPASS_BACKOFF.has(reason) && this.status.nextRetryAt && Date.parse(this.status.nextRetryAt) > this.clock().getTime()) {
      return { status: 'skipped', why: 'backoff' };
    }
    if (reason === 'manual' || reason === 'retry' || reason === 'online') this.clearRetry();

    const run: CycleContext = { userId, generation: this.generation };
    const outcome = await this.deps.locks.request(SYNC_LOCK_NAME, async () => {
      this.set({ kind: 'syncing', error: undefined, nextRetryAt: undefined });
      try {
        await this.deps.auth.ready?.();
        this.checkpoint(run);
        const skippedInvalid = await this.cycle(run);
        this.checkpoint(run);
        const now = this.clock().toISOString();
        this.failures = 0;
        await this.deps.kv.update<unknown>('sync', (cur) => ({ ...normalizeSyncMeta(cur), lastSyncedAt: now, lastError: null }));
        const rejected = await this.deps.local.countRejected();
        this.set({
          kind: 'idle',
          lastSyncedAt: now,
          error: undefined,
          nextRetryAt: undefined,
          remoteInvalid: skippedInvalid > 0 || rejected > 0 ? true : undefined,
          remoteSkipped: skippedInvalid - this.cycleRejected > 0 ? true : undefined,
          rejected: rejected > 0 ? rejected : undefined,
          pending: await this.deps.local.countDirty(),
        });
        return { status: 'ran', ok: true } as const;
      } catch (e) {
        if (e instanceof SyncAborted) {
          // The account context changed under us: leave no trace, the new context decides what runs next.
          if (this.status.kind === 'syncing') this.set({ kind: 'paused', error: undefined, nextRetryAt: undefined });
          return { status: 'skipped', why: 'aborted' } as const;
        }
        return this.fail(e);
      }
    });
    if (outcome.status === 'busy') {
      // Another tab holds the lock: its result lands in kv `sync`, which `start()` watches.
      if (this.status.kind === 'syncing') this.set({ kind: 'idle' });
      return { status: 'skipped', why: 'busy' };
    }
    return outcome.value;
  }

  /** Throws `SyncAborted` when the cycle no longer belongs to the current account context (M7-D2). */
  private checkpoint(run: CycleContext): void {
    if (this.generation !== run.generation || this.deps.auth.currentUserId() !== run.userId) throw new SyncAborted();
  }

  /** Returns the number of invalid remote rows skipped (+ rows the cloud rejected). */
  private async cycle(run: CycleContext): Promise<number> {
    // 0. v4.0 (ADR-33): a device that pulled goals with an older schema generation (and skipped rows
    //    it could not read, e.g. open-ended goals before M11) re-pulls the whole goals table once.
    await this.resetPullCursorOnce();
    const remote = await this.getRemote();
    let skippedInvalid = 0;
    this.cycleRejected = 0;

    // 1. Push, then read the canonical rows back (ADR-21: the device learns when it lost).
    skippedInvalid += await this.pushPhase(remote, run);

    // 2. Pull by keyset cursor, goals before entries; the cursor is stored after each applied page.
    for (const table of ['goals', 'entries'] as const) {
      const meta = await this.readMeta();
      let cursor: PullCursor | null = rewindCursor(meta.cursor[table]);
      for (;;) {
        this.checkpoint(run);
        const page = table === 'goals' ? await remote.pull('goals', cursor, this.batchSize) : await remote.pull('entries', cursor, this.batchSize);
        skippedInvalid += page.skippedInvalid;
        this.checkpoint(run);
        if (page.rows.length > 0) {
          await this.deps.local.applyRemote(table === 'goals' ? { goals: page.rows as never, entries: [] } : { goals: [], entries: page.rows as never });
        }
        if (page.next) {
          cursor = page.next;
          await this.writeCursor(table, page.next);
        }
        if (!page.hasMore) break;
      }
    }

    // 3. Orphans (entries of goals deleted elsewhere) are tombstoned; together with the entries the
    //    pull cascaded, they are pushed right away so one cycle per device converges.
    this.checkpoint(run);
    await this.deps.local.tombstoneOrphanEntries(this.clock());
    if ((await this.deps.local.countDirty()) > 0) skippedInvalid += await this.pushPhase(remote, run);

    // 3b. Preferences (v2.1): push dirty groups (the server returns the merged row) or pull.
    const dirtyPrefs = await this.deps.prefs.getDirty();
    let remotePrefs;
    this.checkpoint(run);
    if (dirtyPrefs) {
      remotePrefs = await remote.pushPrefs(dirtyPrefs);
    } else {
      const pulled = await remote.pullPrefs();
      skippedInvalid += pulled.skippedInvalid;
      remotePrefs = pulled.prefs;
    }
    this.checkpoint(run);
    const applied = await this.deps.prefs.applyRemote(remotePrefs);
    if (applied.reminderChanged || applied.localeChanged) this.emit({ type: 'prefs-applied', reminderChanged: applied.reminderChanged, localeChanged: applied.localeChanged });

    return skippedInvalid;
  }

  /**
   * Push loop: up to `maxPushBatches` batches of dirty rows, each read back and applied. Rows the cloud
   * refuses (M7-D1) are flagged `dirty = 2` on the device — kept, no longer counted as waiting, not
   * retried until edited — and counted like invalid remote rows so the Account card mentions them.
   */
  private async pushPhase(remote: RemoteStore, run: CycleContext): Promise<number> {
    let skippedInvalid = 0;
    let before = await this.deps.local.countDirty();
    for (let i = 0; i < this.maxPushBatches && before > 0; i += 1) {
      const dirty = await this.deps.local.getDirty(this.batchSize);
      if (dirty.goals.length === 0 && dirty.entries.length === 0) break;
      this.checkpoint(run);
      const pushed = await remote.push(dirty);
      this.checkpoint(run);
      if (rejectedCount(pushed) > 0) {
        skippedInvalid += rejectedCount(pushed);
        this.cycleRejected += rejectedCount(pushed);
        await this.deps.local.markRejected(pushed.rejected);
      }
      const rejectedGoals = new Set(pushed.rejected.goals);
      const rejectedEntries = new Set(pushed.rejected.entries);
      const fetched = await remote.fetchByIds({ goals: dirty.goals.map((g) => g.id).filter((id) => !rejectedGoals.has(id)), entries: dirty.entries.map((e) => e.id).filter((id) => !rejectedEntries.has(id)) });
      skippedInvalid += fetched.skippedInvalid;
      this.checkpoint(run);
      await this.deps.local.applyRemote({ goals: fetched.goals, entries: fetched.entries });
      const after = await this.deps.local.countDirty();
      if (after >= before) break; // nothing was acknowledged (e.g. rows rejected server-side): do not spin
      before = after;
    }
    return skippedInvalid;
  }

  private async fail(e: unknown): Promise<SyncOutcome> {
    const offline = this.deps.connectivity ? !this.deps.connectivity.isOnline() : false;
    const code: SyncErrorCode = isRemoteError(e) ? e.code : offline ? 'SYNC_OFFLINE' : 'SYNC_UNREACHABLE';
    const at = this.clock().toISOString();
    try {
      await this.deps.kv.update<unknown>('sync', (cur) => ({ ...normalizeSyncMeta(cur), lastError: { code, at } }));
    } catch {
      // storage trouble: the in-memory status still reports the error
    }
    if (code === 'SYNC_UNAUTHORIZED') {
      this.clearRetry();
      this.set({ kind: 'paused', error: code, nextRetryAt: undefined });
      this.deps.auth.onUnauthorized?.();
      return { status: 'ran', ok: false, error: code };
    }
    this.failures += 1;
    const delay = backoffMs(this.failures);
    const nextRetryAt = new Date(this.clock().getTime() + delay).toISOString();
    this.scheduleRetry(delay);
    this.set({ kind: code === 'SYNC_OFFLINE' ? 'offline' : 'error', error: code, nextRetryAt, pending: await this.safeCountDirty() });
    return { status: 'ran', ok: false, error: code };
  }

  // ---- internals ----

  /**
   * ADR-33: one atomic `kv.update` — when kv `sync` exists and its `pullResetVersion` is below
   * `PULL_RESET_VERSION`, drop `cursor.goals` (entries keep their cursor: their rows were stored, only
   * hidden behind the missing goal) and stamp the version, so this runs once per device. No kv row
   * (never signed in) → nothing is written. Pure callback, no await inside the transaction (ADR-14).
   */
  private async resetPullCursorOnce(): Promise<void> {
    await this.deps.kv.update<unknown>('sync', (cur) => {
      if (cur == null) return undefined;
      const meta = normalizeSyncMeta(cur);
      if ((meta.pullResetVersion ?? 0) >= PULL_RESET_VERSION) return undefined;
      return { ...meta, cursor: { ...meta.cursor, goals: null }, pullResetVersion: PULL_RESET_VERSION };
    });
  }

  private async bindUser(userId: string, resetCursor: boolean): Promise<void> {
    await this.deps.kv.update<unknown>('sync', (cur) => {
      const meta = normalizeSyncMeta(cur);
      return resetCursor ? { ...meta, lastUserId: userId, cursor: { goals: null, entries: null } } : { ...meta, lastUserId: userId };
    });
  }

  private getRemote(): Promise<RemoteStore> {
    if (this.remote) return Promise.resolve(this.remote);
    return this.deps.loadRemote().then((r) => {
      this.remote = r;
      return r;
    });
  }

  private async readMeta(): Promise<SyncMeta> {
    return normalizeSyncMeta(await this.deps.kv.get<unknown>('sync'));
  }

  private async writeCursor(table: RemoteTable, cursor: PullCursor): Promise<void> {
    await this.deps.kv.update<unknown>('sync', (cur) => {
      const meta = normalizeSyncMeta(cur);
      return { ...meta, cursor: { ...meta.cursor, [table]: cursor } };
    });
  }

  private async safeCountDirty(): Promise<number> {
    try {
      return await this.deps.local.countDirty();
    } catch {
      return this.status.pending;
    }
  }

  private scheduleRetry(delay: number): void {
    this.clearRetry();
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow('retry');
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.timers.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private set(patch: Partial<SyncStatus>): void {
    const next: SyncStatus = { ...this.status, ...patch };
    // Drop undefined optionals so equality checks and tests see a clean object.
    for (const key of ['error', 'nextRetryAt', 'remoteInvalid', 'remoteSkipped', 'rejected'] as const) if (next[key] === undefined) delete next[key];
    this.status = next;
    this.listeners.forEach((l) => l(next));
  }

  private setPrompt(prompt: MergePrompt | null): void {
    this.mergePrompt = prompt;
    this.promptListeners.forEach((l) => l(prompt));
  }

  private emit(e: SyncEvent): void {
    this.eventListeners.forEach((l) => l(e));
  }
}
