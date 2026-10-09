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
      return { key: 'errors.GOAL_PERIOD_INVALID' };
    case 'ENTRY_DAY_LIMIT_EXCEEDED': {
      const remaining = Number(error.params?.remaining ?? 0);
      if (remaining <= 0) return { key: 'errors.ENTRY_DAY_LIMIT_EXCEEDED_full' };
      return { key: 'errors.ENTRY_DAY_LIMIT_EXCEEDED', params: { remaining: f.number(remaining) } };
    }
    case 'DATE_OUTSIDE_GOAL_PERIOD':
      return {
        key: 'errors.DATE_OUTSIDE_GOAL_PERIOD',
        params: { start: f.dateShort(String(error.params?.start ?? '')), end: f.dateShort(String(error.params?.end ?? '')) },
      };
    case 'GOAL_NAME_REQUIRED':
    case 'GOAL_NAME_TOO_LONG':
    case 'GOAL_WHY_TOO_LONG':
    case 'GOAL_PERIOD_EXCLUDES_ENTRIES':
    case 'GOAL_NOT_FOUND':
    case 'ENTRY_NOT_FOUND':
    case 'ENTRY_MINUTES_INVALID':
    case 'ENTRY_NOTE_TOO_LONG':
    case 'DATE_IN_FUTURE':
      return { key: `errors.${error.code}` };
    default:
      return { key: 'errors.UNKNOWN' };
  }
}

/** Key used when a write to storage fails (not a DomainError). */
export const WRITE_FAILED_KEY: MessageKey = 'errors.WRITE_FAILED';
