// M15-AC8: App Store metadata (store/ios/metadata/{en-US,vi}/*.txt) = DESIGN v5.0 7.8.7 verbatim, within Apple's
// limits (name / subtitle ≤ 30 chars, promotional text ≤ 170, description ≤ 4000, keywords ≤ 100 UTF-8 bytes).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'store', 'ios', 'metadata');
const FILES = ['name.txt', 'subtitle.txt', 'promotional_text.txt', 'description.txt', 'keywords.txt', 'release_notes.txt', 'review_notes.txt', 'support_url.txt', 'privacy_url.txt'] as const;
const LOCALES = ['en-US', 'vi'] as const;
const read = (locale: string, file: string) => readFileSync(join(root, locale, file), 'utf8').replace(/\r\n/g, '\n');
const chars = (s: string) => [...s].length;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

/** DESIGN 7.8.7 verbatim (the short fields; the long ones are checked by their anchors and limits). */
const DESIGN = {
  'en-US': {
    name: '1% Better per Day',
    subtitle: 'Track tiny daily progress',
    promotional_text: 'Set a goal, log a few minutes each day and watch the small gains add up. Heatmap, streaks, a timer and gentle reminders. Works offline, no ads.',
    keywords: 'habit,tracker,goals,streak,timer,progress,daily,routine,heatmap,study,reading,practice,minutes',
  },
  vi: {
    name: '1% Better per Day',
    subtitle: 'Mỗi ngày tiến bộ thêm 1%',
    promotional_text: 'Đặt mục tiêu, ghi vài phút mỗi ngày và xem những bước nhỏ dày lên. Biểu đồ nhiệt, chuỗi ngày, bộ đếm giờ, nhắc nhở. Dùng được khi ngoại tuyến, không quảng cáo.',
    keywords: 'thói quen,mục tiêu,theo dõi,chuỗi ngày,đếm giờ,nhắc nhở,học tập',
  },
} as const;

describe.each(LOCALES)('store/ios/metadata/%s (M15-AC8)', (locale) => {
  it('has exactly the 9 files, none empty, UTF-8 without BOM, no trailing blank line, LF only', () => {
    expect(readdirSync(join(root, locale)).sort()).toEqual([...FILES].sort());
    for (const file of FILES) {
      const raw = readFileSync(join(root, locale, file));
      expect(raw.length, file).toBeGreaterThan(0);
      expect(raw[0], `${file} BOM`).not.toBe(0xef);
      const text = raw.toString('utf8');
      expect(text, `${file} CRLF`).not.toContain('\r');
      expect(text.trim().length, `${file} empty`).toBeGreaterThan(0);
      expect(text, `${file} trailing blank line`).not.toMatch(/\n\s*\n$/);
      expect(text, `${file} trailing newline`).not.toMatch(/\n$/);
    }
  });

  it('short fields are the DESIGN strings and within the limits', () => {
    const d = DESIGN[locale];
    expect(read(locale, 'name.txt')).toBe(d.name);
    expect(chars(d.name)).toBeLessThanOrEqual(30);
    expect(read(locale, 'subtitle.txt')).toBe(d.subtitle);
    expect(chars(read(locale, 'subtitle.txt'))).toBeLessThanOrEqual(30);
    expect(read(locale, 'promotional_text.txt')).toBe(d.promotional_text);
    expect(chars(read(locale, 'promotional_text.txt'))).toBeLessThanOrEqual(170);
    expect(read(locale, 'support_url.txt')).toBe('https://minh-lgm.github.io/one-percent-better/support.html');
    expect(read(locale, 'privacy_url.txt')).toBe('https://minh-lgm.github.io/one-percent-better/privacy.html');
  });

  it('keywords: ≤ 100 UTF-8 bytes, comma-separated without stray spaces, no app name, no duplicates', () => {
    const kw = read(locale, 'keywords.txt');
    expect(kw).toBe(DESIGN[locale].keywords);
    expect(bytes(kw)).toBeLessThanOrEqual(100);
    expect(kw).not.toMatch(/,\s|\s,/);
    expect(kw).not.toMatch(/^\s|\s$/);
    const parts = kw.split(',');
    expect(parts.every((p) => p.length > 0)).toBe(true);
    expect(new Set(parts).size).toBe(parts.length);
    expect(kw.toLowerCase()).not.toContain('1% better');
    expect(kw.toLowerCase()).not.toContain('better per day');
  });

  it('description ≤ 4000 chars with the DESIGN anchors; release notes present', () => {
    const desc = read(locale, 'description.txt');
    expect(chars(desc)).toBeLessThanOrEqual(4000);
    expect(chars(desc)).toBeGreaterThan(1000);
    const anchors = locale === 'en-US'
      ? ['1% Better per Day helps you get a little better every day, on purpose.', 'WHAT YOU GET', '• Goals your way', '• Daily reminders', 'SIMPLE AND PRIVATE', "Small steps, every day. That's the whole idea."]
      : ['1% Better per Day giúp bạn tiến bộ thêm một chút mỗi ngày, một cách có chủ đích.', 'BẠN CÓ GÌ', '• Mục tiêu theo cách của bạn', '• Nhắc nhở hằng ngày', 'ĐƠN GIẢN VÀ RIÊNG TƯ', 'Những bước nhỏ, mỗi ngày. Chỉ có vậy.'];
    for (const a of anchors) expect(desc, a).toContain(a);
    expect(desc.match(/^• /gm)).toHaveLength(8);
    const notes = read(locale, 'release_notes.txt');
    expect(notes).toContain(locale === 'en-US' ? 'Welcome to 1% Better per Day on iPhone.' : 'Chào mừng bạn đến với 1% Better per Day trên iPhone.');
    expect(notes).toContain(locale === 'en-US' ? 'even when the app is closed' : 'kể cả khi đã đóng app');
    expect(chars(notes)).toBeLessThanOrEqual(4000);
  });

  it('review notes: no sign-in needed, the Delete account path, local notifications, contact (A-68)', () => {
    const notes = read(locale, 'review_notes.txt');
    expect(notes).toContain(locale === 'en-US' ? 'No sign-in is required' : 'Không cần đăng nhập');
    expect(notes).toContain(locale === 'en-US' ? 'Settings > Account > Delete account' : 'Cài đặt > Tài khoản > Xóa tài khoản (Settings > Account > Delete account)');
    expect(notes).toContain(locale === 'en-US' ? 'no demo account is needed' : 'không cần tài khoản demo');
    expect(notes).toContain(locale === 'en-US' ? 'local notifications' : 'thông báo cục bộ');
    expect(notes).toContain('Contact: minh.lgm@gmail.com'.replace('Contact', locale === 'en-US' ? 'Contact' : 'Liên hệ'));
  });

  it('no forbidden words anywhere: Android, beta, prices, "free" / "miễn phí" (A-67, DESIGN 7.8.7)', () => {
    for (const file of FILES) {
      const text = read(locale, file);
      expect(text, file).not.toMatch(/android/i);
      expect(text, file).not.toMatch(/\bbeta\b/i);
      expect(text, file).not.toMatch(/[$€£]\s?\d|\d\s?(USD|VND|đ\b)/);
      expect(text, file).not.toMatch(/\bfree\b/i);
      expect(text, file).not.toMatch(/miễn phí/i);
    }
  });
});

describe('store/fixtures and screenshots folders exist (M15-T5)', () => {
  it('demo-en.json and demo-vi.json are committed', () => {
    expect(existsSync(join(process.cwd(), 'store', 'fixtures', 'demo-en.json'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'store', 'fixtures', 'demo-vi.json'))).toBe(true);
  });
});
