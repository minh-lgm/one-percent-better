import { describe, expect, it } from 'vitest';
import { createFormatters } from '../i18n/format';
import { createI18n, createTranslator } from '../i18n/instance';
import { errorMessage, EXPORT_FAILED_KEY } from './error-messages';

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
    const codes = [
      'GOAL_NAME_REQUIRED',
      'GOAL_NAME_TOO_LONG',
      'GOAL_WHY_TOO_LONG',
      'GOAL_PERIOD_EXCLUDES_ENTRIES',
      'GOAL_NOT_FOUND',
      'ENTRY_NOT_FOUND',
      'ENTRY_MINUTES_INVALID',
      'ENTRY_NOTE_TOO_LONG',
      'DATE_IN_FUTURE',
      // M2
      'GOAL_NOT_ACTIVE',
      'TIMER_ALREADY_RUNNING',
      'TIMER_NOT_RUNNING',
      'NOTIFICATIONS_UNSUPPORTED',
      'NOTIFICATIONS_DENIED',
      // M3
      'IMPORT_FILE_TOO_LARGE',
      'IMPORT_INVALID_JSON',
      'IMPORT_INVALID_SCHEMA',
      'IMPORT_INTEGRITY',
    ] as const;
    for (const code of codes) {
      const m = errorMessage({ code, message: '' }, f);
      expect(m.key).toBe(`errors.${code}`);
      expect(() => i18n.t(m.key)).not.toThrow();
    }
    // IMPORT_UNSUPPORTED_VERSION carries the version read from the file (M3).
    const v = errorMessage({ code: 'IMPORT_UNSUPPORTED_VERSION', message: '', params: { v: '2' } }, f);
    expect(v).toEqual({ key: 'errors.IMPORT_UNSUPPORTED_VERSION', params: { v: '2' } });
    expect(i18n.t(v.key, v.params)).toContain('(2)');
    // M5: archiving a goal with a running timer has its own message.
    const timer = errorMessage({ code: 'GOAL_TIMER_RUNNING', message: '' }, f);
    expect(timer.key).toBe('errors.GOAL_TIMER_RUNNING');
    expect(() => i18n.t(timer.key)).not.toThrow();
  });
});

describe('v3.1 keys (M10-AC9, M10-AC10)', () => {
  it('IMPORT_INVALID_SCHEMA with variant outOfRange → its own key; without → the plain key', () => {
    expect(errorMessage({ code: 'IMPORT_INVALID_SCHEMA', message: '', params: { variant: 'outOfRange' } }, f).key).toBe('errors.IMPORT_INVALID_SCHEMA_outOfRange');
    expect(errorMessage({ code: 'IMPORT_INVALID_SCHEMA', message: '' }, f).key).toBe('errors.IMPORT_INVALID_SCHEMA');
    expect(() => i18n.t('errors.IMPORT_INVALID_SCHEMA_outOfRange')).not.toThrow();
    expect(() => i18n.t(EXPORT_FAILED_KEY)).not.toThrow();
    expect(EXPORT_FAILED_KEY).toBe('errors.EXPORT_FAILED');
  });
});

describe('v4.0 keys — open-ended goals (M11-AC1, M11-T5, DESIGN §7.3)', () => {
  it('GOAL_PERIOD_INVALID with variant openEndedTotal → its own key, present in both languages', () => {
    const m = errorMessage({ code: 'GOAL_PERIOD_INVALID', message: '', params: { variant: 'openEndedTotal' } }, f);
    expect(m.key).toBe('errors.GOAL_PERIOD_INVALID_openEndedTotal');
    expect(() => i18n.t(m.key)).not.toThrow();
    const enI18n = createI18n({ locale: 'en', strictMissingKeys: true });
    expect(enI18n.t(m.key)).toBe('A Total hours goal needs an end date. Choose when it ends, or switch to Minutes per day.');
    expect(i18n.t(m.key)).toBe('Mục tiêu Tổng số giờ cần có ngày kết thúc. Hãy chọn ngày kết thúc, hoặc chuyển sang Phút mỗi ngày.');
  });

  it('DATE_OUTSIDE_GOAL_PERIOD with params.end === null → the sentence with the start date only; a string end keeps the old key', () => {
    expect(errorMessage({ code: 'DATE_OUTSIDE_GOAL_PERIOD', message: '', params: { start: '2026-10-01', end: null } }, f)).toEqual({
      key: 'errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded',
      params: { start: '01/10/2026' },
    });
    expect(i18n.t('errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded', { start: '01/10/2026' })).toBe('Ngày đó nằm trước ngày mục tiêu này bắt đầu (01/10/2026).');
    expect(errorMessage({ code: 'DATE_OUTSIDE_GOAL_PERIOD', message: '', params: { start: '2026-10-01', end: '2026-10-31' } }, f).key).toBe('errors.DATE_OUTSIDE_GOAL_PERIOD');
  });
});

// ---- v8.0 (M17-AC9, DESIGN 7.9.0 / ARCH §4.8 j): the `roadmap` scope tries the namespace first ----
import roadmapEn from '../i18n/resources/roadmap.en.json';
import { flattenMessages } from '../i18n/parity';
import { roadmapErrorMessage } from './roadmap-errors';

describe('roadmapErrorMessage — the roadmap namespace first (M17-AC9, ui/roadmap-errors.ts)', () => {
  const NS = flattenMessages(roadmapEn);
  const exists = (key: string) => key.startsWith('roadmap:') && key.slice('roadmap:'.length) in NS;

  it('DATE_IN_FUTURE and GOAL_NOT_FOUND → roadmap:errors.<CODE> in the roadmap scope, errors.<CODE> by default', () => {
    expect(roadmapErrorMessage({ code: 'DATE_IN_FUTURE', message: '' }, f, exists).key).toBe('roadmap:errors.DATE_IN_FUTURE');
    expect(roadmapErrorMessage({ code: 'GOAL_NOT_FOUND', message: '' }, f, exists).key).toBe('roadmap:errors.GOAL_NOT_FOUND');
    expect(errorMessage({ code: 'DATE_IN_FUTURE', message: '' }, f).key).toBe('errors.DATE_IN_FUTURE');
    expect(errorMessage({ code: 'GOAL_NOT_FOUND', message: '' }, f).key).toBe('errors.GOAL_NOT_FOUND');
  });

  it('ROADMAP_* variants pick the suffixed key; a variant without its own key falls back to the unsuffixed one; params are formatted', () => {
    expect(roadmapErrorMessage({ code: 'ROADMAP_NOT_FOUND', message: '', params: { kind: 'phase' } }, f, exists).key).toBe('roadmap:errors.ROADMAP_NOT_FOUND_phase');
    expect(roadmapErrorMessage({ code: 'ROADMAP_DATE_INVALID', message: '', params: { variant: 'order' } }, f, exists).key).toBe('roadmap:errors.ROADMAP_DATE_INVALID_order');
    expect(roadmapErrorMessage({ code: 'ROADMAP_SCORE_INVALID', message: '', params: { variant: 'precision' } }, f, exists).key).toBe('roadmap:errors.ROADMAP_SCORE_INVALID_precision');
    expect(roadmapErrorMessage({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'title', message: '', params: { max: 80 } }, f, exists)).toEqual({ key: 'roadmap:errors.ROADMAP_TEXT_TOO_LONG_title', params: { max: '80' } });
    expect(roadmapErrorMessage({ code: 'ROADMAP_LIMIT_REACHED', message: '', params: { kind: 'item', max: 200 } }, f, exists)).toEqual({ key: 'roadmap:errors.ROADMAP_LIMIT_REACHED_item', params: { max: '200' } });
    expect(roadmapErrorMessage({ code: 'ROADMAP_GOAL_ALREADY_LINKED', message: '', params: { title: 'QPT 21 tuần' } }, f, exists)).toEqual({ key: 'roadmap:errors.ROADMAP_GOAL_ALREADY_LINKED', params: { title: 'QPT 21 tuần' } });
    // Unsuffixed fallbacks: ROADMAP_TITLE_REQUIRED has no variants; a (hypothetical) unknown variant drops to the base key when it exists …
    expect(roadmapErrorMessage({ code: 'ROADMAP_TITLE_REQUIRED', field: 'title', message: '' }, f, exists).key).toBe('roadmap:errors.ROADMAP_TITLE_REQUIRED');
    expect(roadmapErrorMessage({ code: 'ROADMAP_TARGET_INVALID', message: '', params: { variant: 'step' } }, f, exists).key).toBe('roadmap:errors.ROADMAP_TARGET_INVALID');
    // … and a code the namespace does not know at all (every variant missing) falls back to the main resource.
    expect(roadmapErrorMessage({ code: 'ROADMAP_NOT_FOUND', message: '', params: { kind: 'ghost' } }, f, (k) => k === 'roadmap:errors.ROADMAP_NOT_FOUND_roadmap').key).toBe('errors.UNKNOWN');
    expect(roadmapErrorMessage({ code: 'IMPORT_INTEGRITY', message: '' }, f, exists).key).toBe('errors.IMPORT_INTEGRITY');
    // Without `exists` the most specific namespace key is returned.
    expect(roadmapErrorMessage({ code: 'ROADMAP_NOT_FOUND', message: '', params: { kind: 'item' } }, f).key).toBe('roadmap:errors.ROADMAP_NOT_FOUND_item');
  });
});
