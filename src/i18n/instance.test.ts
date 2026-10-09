import { describe, expect, it } from 'vitest';
import { createI18n, createTranslator, currentLocale, MissingTranslationError, setLocale } from './instance';

describe('i18n instance', () => {
  it('translates with interpolation and plurals in en', () => {
    const i18n = createI18n({ locale: 'en', strictMissingKeys: true });
    const tr = createTranslator(i18n);
    expect(tr.t('nav.today')).toBe('Today');
    expect(tr.t('format.goalsCount', { count: 1 })).toBe('1 goal');
    expect(tr.t('format.goalsCount', { count: 5 })).toBe('5 goals');
    expect(tr.t('today.summary', { n: 1, count: 1 })).toBe('1 of 1 goal on target');
    expect(tr.t('today.summary', { n: 1, count: 3 })).toBe('1 of 3 goals on target');
  });

  it('vi uses the _other form only', () => {
    const i18n = createI18n({ locale: 'vi', strictMissingKeys: true });
    const tr = createTranslator(i18n);
    expect(tr.locale).toBe('vi');
    expect(tr.t('format.goalsCount', { count: 1 })).toBe('1 mục tiêu');
    expect(tr.t('today.summary', { n: 1, count: 1 })).toBe('Đã đạt 1/1 mục tiêu');
    expect(tr.t('today.summary', { n: 1, count: 3 })).toBe('Đã đạt 1/3 mục tiêu');
  });

  it('throws on a missing key in strict mode', () => {
    const i18n = createI18n({ locale: 'en', strictMissingKeys: true });
    expect(() => i18n.t('does.not.exist' as never)).toThrow(MissingTranslationError);
  });

  it('returns the key outside strict mode', () => {
    const i18n = createI18n({ locale: 'en' });
    expect(i18n.t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('setLocale changes language and <html lang>', () => {
    const i18n = createI18n({ locale: 'en', strictMissingKeys: true });
    setLocale(i18n, 'vi');
    expect(currentLocale(i18n)).toBe('vi');
    expect(i18n.t('nav.today')).toBe('Hôm nay');
    setLocale(i18n, 'en');
    expect(i18n.t('nav.today')).toBe('Today');
  });
});
