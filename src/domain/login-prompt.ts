// Login-prompt rules (PRD FR-52, FR-53, A-30; DESIGN F14). Pure functions: the service feeds them
// the kv row, the data facts and the account context; nothing here reads storage or the clock.
import type { ISODateTime } from './types';

/** Days since the first live record after which Today suggests signing in (A-30). */
export const LOGIN_PROMPT_MIN_DAYS = 7;
/** Live entries from which Today suggests signing in regardless of age (A-30). */
export const LOGIN_PROMPT_MIN_ENTRIES = 10;
/** "Not now" hides the banner for this long (A-30). */
export const LOGIN_PROMPT_SNOOZE_DAYS = 14;
/** After this many "Not now" the banner never comes back on Today (the Account card stays). */
export const LOGIN_PROMPT_MAX_DISMISSALS = 3;
/** One export hint per this many days (FR-53). */
export const EXPORT_HINT_INTERVAL_DAYS = 30;
/**
 * A-46 (M8-D1): a stamp more than this far in the future cannot be real (the device clock was wrong
 * when it was written) and is treated as absent, so it can never silence the prompts for years.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 86_400_000;

const DAY_MS = 86_400_000;

/** Epoch ms of a stored stamp, or `null` when missing, unparsable or implausibly in the future (A-46). */
function plausibleStamp(value: ISODateTime | null, now: Date): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (ms > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) return null;
  return ms;
}

/** kv key `loginPrompt` (ARCHITECTURE §4.1). Device-only: not synced, not in a backup, survives import and "Remove data". */
export interface LoginPromptState {
  dismissCount: number;
  lastDismissedAt: ISODateTime | null;
  lastExportHintAt: ISODateTime | null;
}

export const EMPTY_LOGIN_PROMPT: LoginPromptState = { dismissCount: 0, lastDismissedAt: null, lastExportHintAt: null };

function stamp(value: unknown): ISODateTime | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Whatever is stored under kv `loginPrompt` → a complete state (missing/corrupt → defaults). */
export function normalizeLoginPrompt(raw: unknown): LoginPromptState {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof LoginPromptState, unknown>>) : {};
  const count = typeof r.dismissCount === 'number' && Number.isFinite(r.dismissCount) && r.dismissCount > 0 ? Math.floor(r.dismissCount) : 0;
  return { dismissCount: count, lastDismissedAt: stamp(r.lastDismissedAt), lastExportHintAt: stamp(r.lastExportHintAt) };
}

/** Account situation as the prompts see it (`AuthState.kind`; `unavailable` = cloud not configured). */
export type PromptAuthKind = 'unavailable' | 'signed-out' | 'signing-in' | 'signed-in' | 'expired';

export interface LoginPromptInput {
  now: Date;
  /** `AuthState.kind`. Only `signed-out` qualifies: `expired` is handled by the Account card (A-D27). */
  auth: PromptAuthKind;
  /** The Today banner needs a connection (FR-52); the export hint is only claimed online (OQ-D12). */
  online: boolean;
  /** Smallest `createdAt` among live goals and entries; `null` = no data. */
  firstDataAt: ISODateTime | null;
  /** Live entries. */
  entryCount: number;
  state: LoginPromptState;
}

/** The data is worth protecting: ≥ 7 days since the first record, or ≥ 10 entries (A-30). */
export function hasEnoughData(now: Date, firstDataAt: ISODateTime | null, entryCount: number): boolean {
  if (entryCount >= LOGIN_PROMPT_MIN_ENTRIES) return true;
  if (!firstDataAt) return false;
  const first = Date.parse(firstDataAt);
  if (Number.isNaN(first)) return false;
  return now.getTime() - first >= LOGIN_PROMPT_MIN_DAYS * DAY_MS;
}

/** "Not now" less than 14 days ago. A stamp more than 24 h in the future counts as no "Not now" at all (A-46). */
export function isSnoozed(now: Date, state: LoginPromptState): boolean {
  const last = plausibleStamp(state.lastDismissedAt, now);
  if (last === null) return false;
  return now.getTime() - last < LOGIN_PROMPT_SNOOZE_DAYS * DAY_MS;
}

/** FR-52: the Today banner. */
export function shouldShowLoginPrompt(input: LoginPromptInput): boolean {
  if (input.auth !== 'signed-out') return false;
  if (!input.online) return false;
  if (input.state.dismissCount >= LOGIN_PROMPT_MAX_DISMISSALS) return false;
  if (isSnoozed(input.now, input.state)) return false;
  return hasEnoughData(input.now, input.firstDataAt, input.entryCount);
}

export interface ExportHintInput {
  now: Date;
  auth: PromptAuthKind;
  state: LoginPromptState;
}

/** FR-53: the hint under Export, at most once every 30 days, never when signed in / expired / cloud off. A future stamp (> 24 h) counts as never hinted (A-46). */
export function shouldShowExportHint(input: ExportHintInput): boolean {
  if (input.auth !== 'signed-out') return false;
  const last = plausibleStamp(input.state.lastExportHintAt, input.now);
  if (last === null) return true;
  return input.now.getTime() - last >= EXPORT_HINT_INTERVAL_DAYS * DAY_MS;
}

/** The state after "Not now". */
export function dismissed(state: LoginPromptState, now: Date): LoginPromptState {
  return { ...state, dismissCount: state.dismissCount + 1, lastDismissedAt: now.toISOString() };
}

/** Earliest `createdAt` of the given live records (`null` when there are none or none parses). */
export function firstCreatedAt(records: ReadonlyArray<{ createdAt: ISODateTime }>): ISODateTime | null {
  let best: ISODateTime | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const r of records) {
    const ms = Date.parse(r.createdAt);
    if (Number.isNaN(ms) || ms >= bestMs) continue;
    bestMs = ms;
    best = r.createdAt;
  }
  return best;
}
