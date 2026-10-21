import type { DomainError } from '../domain/types';
import type { Formatters } from '../i18n/format';
import type { MessageKey, TParams } from '../i18n/types';

export interface ErrorMessage {
  key: MessageKey;
  params?: TParams;
}

/**
 * Map a `DomainError` to an i18n key + params (DESIGN §7.3). Params are
 * formatted for the current locale before interpolation. `message` is never shown.
 */
export function errorMessage(error: DomainError, f: Formatters): ErrorMessage {
  const variant = typeof error.params?.variant === 'string' ? error.params.variant : undefined;
  switch (error.code) {
    case 'GOAL_TARGET_INVALID':
      if (variant === 'total') return { key: 'errors.GOAL_TARGET_INVALID_total' };
      if (variant === 'tooMuch') return { key: 'errors.GOAL_TARGET_INVALID_tooMuch' };
      return { key: 'errors.GOAL_TARGET_INVALID_daily' };
    case 'GOAL_PERIOD_INVALID':
      if (variant === 'endBeforeStart') return { key: 'errors.GOAL_PERIOD_INVALID_endBeforeStart' };
      if (variant === 'tooLong') return { key: 'errors.GOAL_PERIOD_INVALID_tooLong' };
      // v4.0 (M11): a total goal with no end date (the form never produces it; kept as a safety net).
      if (variant === 'openEndedTotal') return { key: 'errors.GOAL_PERIOD_INVALID_openEndedTotal' };
      return { key: 'errors.GOAL_PERIOD_INVALID' };
    case 'ENTRY_DAY_LIMIT_EXCEEDED': {
      const remaining = Number(error.params?.remaining ?? 0);
      if (remaining <= 0) return { key: 'errors.ENTRY_DAY_LIMIT_EXCEEDED_full' };
      return { key: 'errors.ENTRY_DAY_LIMIT_EXCEEDED', params: { remaining: f.number(remaining) } };
    }
    case 'IMPORT_UNSUPPORTED_VERSION':
      return { key: 'errors.IMPORT_UNSUPPORTED_VERSION', params: { v: String(error.params?.v ?? '?') } };
    case 'IMPORT_INVALID_SCHEMA':
      // v3.1 (M5-P1): well-formed file, value outside the app's limits → its own sentence.
      return { key: variant === 'outOfRange' ? 'errors.IMPORT_INVALID_SCHEMA_outOfRange' : 'errors.IMPORT_INVALID_SCHEMA' };
    case 'DATE_OUTSIDE_GOAL_PERIOD': {
      const start = f.dateShort(String(error.params?.start ?? ''));
      // v4.0 (M11): an open-ended goal has no end date → the sentence with the start date only.
      if (error.params?.end === null) return { key: 'errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded', params: { start } };
      return { key: 'errors.DATE_OUTSIDE_GOAL_PERIOD', params: { start, end: f.dateShort(String(error.params?.end ?? '')) } };
    }
    case 'GOAL_NAME_REQUIRED':
    case 'GOAL_NAME_TOO_LONG':
    case 'GOAL_WHY_TOO_LONG':
    case 'GOAL_PERIOD_EXCLUDES_ENTRIES':
    case 'GOAL_NOT_FOUND':
    case 'ENTRY_NOT_FOUND':
    case 'ENTRY_MINUTES_INVALID':
    case 'ENTRY_NOTE_TOO_LONG':
    case 'DATE_IN_FUTURE':
    case 'GOAL_NOT_ACTIVE':
    case 'TIMER_ALREADY_RUNNING':
    case 'TIMER_NOT_RUNNING':
    case 'GOAL_TIMER_RUNNING':
    case 'NOTIFICATIONS_UNSUPPORTED':
    case 'NOTIFICATIONS_DENIED':
    case 'IMPORT_FILE_TOO_LARGE':
    case 'IMPORT_INVALID_JSON':
    case 'IMPORT_INTEGRITY':
    case 'AUTH_OFFLINE':
    case 'AUTH_CANCELLED':
    case 'AUTH_FAILED':
    case 'AUTH_SESSION_EXPIRED':
    case 'ACCOUNT_DELETE_OFFLINE':
    case 'ACCOUNT_DELETE_CANCELLED':
    case 'ACCOUNT_DELETE_FAILED':
    case 'ACCOUNT_DELETE_SESSION_EXPIRED':
      return { key: `errors.${error.code}` };
    default:
      return { key: 'errors.UNKNOWN' };
  }
}

/** Key used when a write to storage fails (not a DomainError). */
export const WRITE_FAILED_KEY: MessageKey = 'errors.WRITE_FAILED';

/** Key used when creating the backup file fails (not a DomainError; DESIGN §7.3 v3.1, M3-P1). */
export const EXPORT_FAILED_KEY: MessageKey = 'errors.EXPORT_FAILED';
/** v5.0 (DESIGN §7.3): the same failure in the native app, where there is no "download" (`capabilities.nativeShare`). */
export const EXPORT_FAILED_NATIVE_KEY: MessageKey = 'errors.EXPORT_FAILED_native';
