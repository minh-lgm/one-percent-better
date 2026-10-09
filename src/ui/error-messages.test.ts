import { describe, expect, it } from 'vitest';
import { createFormatters } from '../i18n/format';
import { createI18n, createTranslator } from '../i18n/instance';
import { errorMessage } from './error-messages';

const i18n = createI18n({ locale: 'vi', strictMissingKeys: true });
const f = createFormatters('vi', createTranslator(i18n));

describe('errorMessage (DESIGN §7.3)', () => {
  it('maps variants of GOAL_TARGET_INVALID and GOAL_PERIOD_INVALID', () => {
    expect(errorMessage({ code: 'GOAL_TARGET_INVALID', message: '', params: { variant: 'daily' } }, f).key).toBe('errors.GOAL_TARGET_INVALID_daily');
    expect(errorMessage({ code: 'GOAL_TARGET_INVALID', message: '', params: { variant: 'total' } }, f).key).toBe('errors.GOAL_TARGET_INVALID_total');
    expect(errorMessage({ code: 'GOAL_TARGET_INVALID', message: '', params: { variant: 'tooMuch' } }, f).key).toBe('errors.GOAL_TARGET_INVALID_tooMuch');
    expect(errorMessage({ code: 'GOAL_PERIOD_INVALID', message: '' }, f).key).toBe('errors.GOAL_PERIOD_INVALID');
    expect(errorMessage({ code: 'GOAL_PERIOD_INVALID', message: '', params: { variant: 'endBeforeStart' } }, f).key).toBe('errors.GOAL_PERIOD_INVALID_endBeforeStart');
    expect(errorMessage({ code: 'GOAL_PERIOD_INVALID', message: '', params: { variant: 'tooLong' } }, f).key).toBe('errors.GOAL_PERIOD_INVALID_tooLong');
  });

  it('formats params with the locale formatters', () => {
    expect(errorMessage({ code: 'ENTRY_DAY_LIMIT_EXCEEDED', message: '', params: { remaining: 1040 } }, f)).toEqual({
      key: 'errors.ENTRY_DAY_LIMIT_EXCEEDED',
      params: { remaining: '1.040' },
    });
    expect(errorMessage({ code: 'ENTRY_DAY_LIMIT_EXCEEDED', message: '', params: { remaining: 0 } }, f).key).toBe('errors.ENTRY_DAY_LIMIT_EXCEEDED_full');
    expect(errorMessage({ code: 'DATE_OUTSIDE_GOAL_PERIOD', message: '', params: { start: '2026-10-01', end: '2026-10-31' } }, f)).toEqual({
      key: 'errors.DATE_OUTSIDE_GOAL_PERIOD',
      params: { start: '01/10/2026', end: '31/10/2026' },
    });
  });

  it('every mapped key exists in the resources (strict instance throws otherwise)', () => {
    const codes = ['GOAL_NAME_REQUIRED', 'GOAL_NAME_TOO_LONG', 'GOAL_WHY_TOO_LONG', 'GOAL_PERIOD_EXCLUDES_ENTRIES', 'GOAL_NOT_FOUND', 'ENTRY_NOT_FOUND', 'ENTRY_MINUTES_INVALID', 'ENTRY_NOTE_TOO_LONG', 'DATE_IN_FUTURE'] as const;
    for (const code of codes) {
      const m = errorMessage({ code, message: '' }, f);
      expect(m.key).toBe(`errors.${code}`);
      expect(() => i18n.t(m.key)).not.toThrow();
    }
    expect(errorMessage({ code: 'TIMER_NOT_RUNNING', message: '' }, f).key).toBe('errors.UNKNOWN');
  });
});
