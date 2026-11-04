// QC M17 r1: formatter checks from DESIGN 7.9.0 and M17-AC2 ("f.hours(345) -> 5.8 / 5,8").
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../../src/i18n/format';
import { createI18n, createTranslator } from '../../src/i18n/instance';

const make = (locale: 'en' | 'vi') => createFormatters(locale, createTranslator(createI18n({ locale, strictMissingKeys: true })));
const norm = (s: string) => s.replace(new RegExp(String.fromCharCode(91, 0xa0, 0x202f, 93), 'g'), ' ');

describe('hours formatting (DESIGN 7.9.0 table)', () => {
  it('hoursShort gives the documented Q1 strings', () => {
    const en = make('en');
    const vi = make('vi');
    expect([345, 270, 75, 960, 0, 4500].map((m) => norm(en.hoursShort(m)))).toEqual(['5.8 h', '4.5 h', '1.3 h', '16 h', '0 h', '75 h']);
    expect([345, 270, 75, 960].map((m) => norm(vi.hoursShort(m)))).toEqual(['5,8 giờ', '4,5 giờ', '1,3 giờ', '16 giờ']);
  });
  it('M17-AC2 literal reading: f.hours(345) carries 5.8 (en) and 5,8 (vi), f.hours(960) keeps the legacy 16.0 h', () => {
    const out = { en: [345, 960].map((m) => norm(make('en').hours(m))), vi: [345, 960].map((m) => norm(make('vi').hours(m))) };
    console.log('M17 f.hours', JSON.stringify(out));
    expect(out.en[0]).toMatch(/^5\.8/);
    expect(out.vi[0]).toMatch(/^5,8/);
    // Informational: f.hours keeps the pre-v8 '16.0 h'; the roadmap screens use hoursShort ('16 h'). See report, deviation 3.
    expect(out.en[1]).toBe('16.0 h');
  });
});
