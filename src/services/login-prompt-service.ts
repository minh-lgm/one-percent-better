// Login-prompt use case (ARCHITECTURE §5.3, M8-T1; PRD FR-52, FR-53, A-30). Owns kv `loginPrompt`;
// the rules live in domain/login-prompt. "Not now" and the export-hint claim go through
// `kv.update`, so two tabs (or a double click) cannot dismiss twice or show two hints.
import type { EntryRepository, GoalRepository, KvRepository, Subscribable } from '../data/repositories';
import {
  dismissed,
  firstCreatedAt,
  normalizeLoginPrompt,
  shouldShowExportHint,
  shouldShowLoginPrompt,
  type LoginPromptState,
  type PromptAuthKind,
} from '../domain/login-prompt';
import type { ISODateTime } from '../domain/types';
import { StatsService } from './stats-service';

/** Account facts the prompts depend on; the UI passes `AuthState.kind` and `navigator.onLine`. */
export interface PromptContext {
  auth: PromptAuthKind;
  online: boolean;
}

/** What the data layer knows that matters to the rules (live rows only: tombstones are filtered by the repositories). */
export interface PromptData {
  firstDataAt: ISODateTime | null;
  entryCount: number;
}

export interface PromptDecision {
  banner: boolean;
  exportHint: boolean;
}

export class LoginPromptService {
  private readonly data: StatsService;

  constructor(
    private readonly kv: KvRepository,
    goals: GoalRepository,
    entries: EntryRepository,
  ) {
    // Same "goals + every entry inside a goal period" read as Review; entries never exist outside a period.
    this.data = new StatsService(goals, entries);
  }

  /** `firstDataAt` = smallest `createdAt` over live goals and entries; `entryCount` = live entries. */
  async loadData(): Promise<PromptData> {
    const { goals, entries } = await this.data.load();
    return { firstDataAt: firstCreatedAt([...goals, ...entries]), entryCount: entries.length };
  }

  /** Live version of `loadData()` (re-emits when goals or entries change). */
  watchData(): Subscribable<PromptData> {
    const source = this.data.watch();
    return {
      subscribe: (onNext, onError) => source.subscribe(({ goals, entries }) => onNext({ firstDataAt: firstCreatedAt([...goals, ...entries]), entryCount: entries.length }), onError),
    };
  }

  async getState(): Promise<LoginPromptState> {
    return normalizeLoginPrompt(await this.kv.get<unknown>('loginPrompt'));
  }

  /** kv `loginPrompt`, always normalised (a missing row is the empty state, never `undefined`). */
  watchState(): Subscribable<LoginPromptState> {
    const source = this.kv.watch<unknown>('loginPrompt');
    return { subscribe: (onNext, onError) => source.subscribe((raw) => onNext(normalizeLoginPrompt(raw)), onError) };
  }

  /** One-shot decision (ARCHITECTURE §5.3 `state(now, ctx)`). The UI uses `watchData`/`watchState` + the domain rules instead. */
  async state(now: Date, ctx: PromptContext): Promise<PromptDecision> {
    const [data, state] = await Promise.all([this.loadData(), this.getState()]);
    return {
      banner: shouldShowLoginPrompt({ now, auth: ctx.auth, online: ctx.online, firstDataAt: data.firstDataAt, entryCount: data.entryCount, state }),
      exportHint: ctx.online && shouldShowExportHint({ now, auth: ctx.auth, state }),
    };
  }

  /** "Not now": count + 1, snooze 14 days (atomic read-modify-write). */
  async dismiss(now: Date): Promise<LoginPromptState> {
    let next: LoginPromptState | undefined;
    await this.kv.update<unknown>('loginPrompt', (raw) => {
      next = dismissed(normalizeLoginPrompt(raw), now);
      return next;
    });
    return next ?? dismissed(normalizeLoginPrompt(undefined), now);
  }

  /**
   * After a successful Export: take this month's hint slot. `true` = show the hint (this caller
   * won the atomic update). Only claimed while online (OQ-D12): an offline export must not burn the
   * slot on a hint whose button would be disabled. Never when signed in / expired / cloud off.
   */
  async claimExportHint(now: Date, ctx: PromptContext): Promise<boolean> {
    if (!ctx.online) return false;
    const { written } = await this.kv.update<unknown>('loginPrompt', (raw) => {
      const state = normalizeLoginPrompt(raw);
      return shouldShowExportHint({ now, auth: ctx.auth, state }) ? { ...state, lastExportHintAt: now.toISOString() } : undefined;
    });
    return written;
  }
}
