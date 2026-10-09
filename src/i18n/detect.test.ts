import { describe, expect, it } from 'vitest';
import { detectLocale } from './detect';

describe('detectLocale (FR-33)', () => {
  it.each(['vi', 'vi-VN', 'VI-vn', 'vi-Latn'])('%s → vi', (lang) => {
    expect(detectLocale(lang)).toBe('vi');
  });

  it.each(['en-US', 'fr-FR', '', undefined, null, 'en'])('%s → en', (lang) => {
    expect(detectLocale(lang as string | undefined)).toBe('en');
  });
});
