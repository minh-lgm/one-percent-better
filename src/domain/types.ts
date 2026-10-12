// Domain types (ARCHITECTURE §4, §5.3, §5.4). Pure data; no display text.

export type ISODate = string; // 'YYYY-MM-DD' local
export type ISODateTime = string; // new Date().toISOString()

export type TargetType = 'daily' | 'total';
export type EntrySource = 'manual' | 'timer';
export type GoalStatus = 'active' | 'upcoming' | 'ended' | 'archived';

export interface Goal {
  id: string;
  name: string;
  why: string;
  targetType: TargetType;
  targetMinutes: number;
  startDate: ISODate;
  endDate: ISODate;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface LogEntry {
  id: string;
  goalId: string;
  date: ISODate;
  minutes: number;
  note: string;
  source: EntrySource;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ActiveTimer {
  goalId: string;
  startedAt: ISODateTime;
}

export interface Settings {
  reminderEnabled: boolean;
  reminderTime: string; // 'HH:MM'
  lastReminderDate: ISODate | null;
  lastBackupAt: ISODateTime | null;
  plusOneShown: Record<string, ISODate>;
}

export const DEFAULT_SETTINGS: Settings = {
  reminderEnabled: false,
  reminderTime: '20:00',
  lastReminderDate: null,
  lastBackupAt: null,
  plusOneShown: {},
};

export type ErrorCode =
  | 'GOAL_NAME_REQUIRED'
  | 'GOAL_NAME_TOO_LONG'
  | 'GOAL_WHY_TOO_LONG'
  | 'GOAL_TARGET_INVALID'
  | 'GOAL_PERIOD_INVALID'
  | 'GOAL_PERIOD_EXCLUDES_ENTRIES'
  | 'GOAL_NOT_FOUND'
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_MINUTES_INVALID'
  | 'ENTRY_NOTE_TOO_LONG'
  | 'ENTRY_DAY_LIMIT_EXCEEDED'
  | 'DATE_IN_FUTURE'
  | 'DATE_OUTSIDE_GOAL_PERIOD'
  | 'GOAL_NOT_ACTIVE'
  | 'TIMER_ALREADY_RUNNING'
  | 'TIMER_NOT_RUNNING'
  | 'GOAL_TIMER_RUNNING'
  | 'IMPORT_FILE_TOO_LARGE'
  | 'IMPORT_INVALID_JSON'
  | 'IMPORT_INVALID_SCHEMA'
  | 'IMPORT_UNSUPPORTED_VERSION'
  | 'IMPORT_INTEGRITY'
  | 'STORAGE_UNAVAILABLE'
  | 'NOTIFICATIONS_UNSUPPORTED'
  | 'NOTIFICATIONS_DENIED'
  // v2.0 (M6) — account (ARCHITECTURE §5.4)
  | 'AUTH_OFFLINE'
  | 'AUTH_CANCELLED'
  | 'AUTH_FAILED'
  | 'AUTH_SESSION_EXPIRED';

/** Sign-in error codes surfaced by `AuthService` (subset of `ErrorCode`). */
export type AuthErrorCode = 'AUTH_OFFLINE' | 'AUTH_CANCELLED' | 'AUTH_FAILED' | 'AUTH_SESSION_EXPIRED';

/**
 * A domain error. `message` is for logs only and never displayed; the UI maps
 * `code` (+ `params.variant`) to an i18n key (ARCHITECTURE §5.4).
 */
export interface DomainError {
  code: ErrorCode;
  field?: string;
  message: string;
  params?: Record<string, string | number>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: DomainError[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(errors: DomainError | DomainError[]): Result<T> => ({
  ok: false,
  errors: Array.isArray(errors) ? errors : [errors],
});

/** Infrastructure failure (IndexedDB unavailable). Thrown, not returned. */
export class StorageError extends Error {
  readonly code = 'STORAGE_UNAVAILABLE' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}
