// M15-AC7 (static part): public/privacy.html and public/support.html follow DESIGN v5.0 7.8.6 — self-contained
// (no script, no external resource), two cards (en + `lang="vi"`), the required mentions and links.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const privacy = read('public/privacy.html');
const support = read('public/support.html');

function sections(html: string): { en: string; vi: string } {
  const en = /<section class="card" aria-labelledby="en-title">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  const vi = /<section class="card" lang="vi" aria-labelledby="vi-title">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  return { en, vi };
}

/** Every `src=` / `href=` that is not same-origin relative, mailto, or an https link in text content. */
function resourceUrls(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('./') && !u.startsWith('mailto:') && !u.startsWith('favicon'));
}

describe.each([
  ['privacy.html', privacy, 'Privacy policy — 1% Better per Day', 'Privacy policy', 'Chính sách quyền riêng tư'],
  ['support.html', support, 'Support — 1% Better per Day', 'Support', 'Hỗ trợ'],
])('%s (DESIGN 7.8.6)', (_name, html, title, enH1, viH1) => {
  it('self-contained: no <script>, no external stylesheet / font / image; brand mark from the same origin', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(html).not.toContain('fonts.googleapis');
    const external = resourceUrls(html).filter((u) => /^https?:/.test(u));
    // The only absolute links are plain anchors to GitHub / Apple (navigation), never a loaded resource.
    for (const u of external) expect(u).toMatch(/^https:\/\/(github\.com\/minh-lgm\/one-percent-better|support\.apple\.com)/);
    expect(html).toContain('<img src="./brand-mark-96.png"');
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toMatch(/^<!doctype html>\s*<html lang="en">/);
  });

  it('two cards: en then vi (section lang="vi"), each with its own h1 and aria-labelledby', () => {
    const { en, vi } = sections(html);
    expect(en).toContain(`<h1 id="en-title">${enH1}</h1>`);
    expect(vi).toContain(`<h1 id="vi-title">${viH1}</h1>`);
    expect(html.indexOf('aria-labelledby="en-title"')).toBeLessThan(html.indexOf('lang="vi"'));
    expect(html.match(/<h1\b/g)).toHaveLength(2);
    expect(html).toContain('<hr />');
  });

  it('both cards link to the other page', () => {
    const { en, vi } = sections(html);
    const other = _name === 'privacy.html' ? 'support.html' : 'privacy.html';
    expect(en).toContain(`href="./${other}"`);
    expect(vi).toContain(`href="./${other}"`);
  });
});

describe('privacy.html content (M15-AC7)', () => {
  const { en, vi } = sections(privacy);
  it('en: iPhone app, Sign in with Apple, local notifications, Settings → Account → Delete account, no tracking, children, contact', () => {
    for (const s of ['iPhone app', 'Sign in with Apple', 'local notifications', 'Settings → Account → Delete account', 'No tracking, no advertising identifier', 'Stop Using Apple ID', 'Children', 'mailto:minh.lgm@gmail.com', 'Last updated: 2026-10-22']) {
      expect(en, s).toContain(s);
    }
    expect(en).not.toContain('browser\'s IndexedDB. Without'); // the 2026-10-12 wording was replaced
  });
  it('vi: app iPhone, Đăng nhập bằng Apple, thông báo cục bộ, Cài đặt → Tài khoản → Xóa tài khoản, Trẻ em', () => {
    for (const s of ['app iPhone', 'Đăng nhập bằng Apple', 'thông báo cục bộ', 'Cài đặt → Tài khoản → Xóa tài khoản', 'Không theo dõi, không mã định danh quảng cáo', 'Trẻ em', 'mailto:minh.lgm@gmail.com', 'Cập nhật: 22/10/2026']) {
      expect(vi, s).toContain(s);
    }
  });
});

describe('support.html content (M15-AC7)', () => {
  const { en, vi } = sections(support);
  it('en: mailto contact, GitHub issues link, six questions, reminder troubleshooting, delete account path', () => {
    expect(en).toContain('href="mailto:minh.lgm@gmail.com"');
    expect(en).toContain('href="https://github.com/minh-lgm/one-percent-better/issues"');
    expect(en.match(/<h3>/g)).toHaveLength(6);
    for (const s of ['How do I back up my data or move to a new iPhone?', "Why didn't I get my reminder?", 'How do I delete my account?', 'What does Hide My Email do?', 'Allow Notifications', 'Settings → Account → Delete account', 'next 14 days']) {
      expect(en, s).toContain(s);
    }
  });
  it('vi: same structure in Vietnamese', () => {
    expect(vi).toContain('href="mailto:minh.lgm@gmail.com"');
    expect(vi).toContain('href="https://github.com/minh-lgm/one-percent-better/issues"');
    expect(vi.match(/<h3>/g)).toHaveLength(6);
    for (const s of ['Làm sao để sao lưu dữ liệu hoặc chuyển sang iPhone mới?', 'Vì sao tôi không nhận được lời nhắc?', 'Làm sao để xóa tài khoản?', 'Cài đặt → Tài khoản → Xóa tài khoản', '14 ngày tới']) {
      expect(vi, s).toContain(s);
    }
  });
});
