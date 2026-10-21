// M13-AC5 (static): src/ui/styles/app.css implements DESIGN v5.0 "Native shell" 4–5 — the four `--safe-*` tokens
// from env(safe-area-inset-*), used by the header (main), tab bar, toasts, bottom sheets, full-page screens and the
// skip link; no rubber-banding; `body.keyboard-open` hides the tab bar (OQ-D25); scroll-padding (DESIGN 8.3).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/styles/app.css'), 'utf8').replace(/\r\n/g, '\n');

/** Declarations of the first rule whose selector list matches `selector` exactly (after whitespace normalisation). */
function rule(selector: string, media?: string): string {
  let scope = css;
  if (media) {
    const start = css.indexOf(media);
    expect(start, media).toBeGreaterThan(-1);
    scope = css.slice(start);
  }
  const re = new RegExp(`(^|\\n) *${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(scope);
  expect(m, `rule ${selector}${media ? ` in ${media}` : ''}`).not.toBeNull();
  return m![2];
}

describe('app.css safe area (DESIGN "Native shell" 4)', () => {
  it('declares the four tokens from env(safe-area-inset-*) with a 0px fallback', () => {
    const root = rule(':root');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(root).toContain(`--safe-${side}: env(safe-area-inset-${side}, 0px);`);
    }
  });
  it('html/body: page background, no overscroll bounce, scroll-padding clear of the status bar and tab bar', () => {
    const html = rule('html');
    expect(html).toContain('background: var(--bg);');
    expect(html).toContain('overscroll-behavior: none;');
    expect(html).toContain('scroll-padding-top: calc(var(--safe-top) + 8px);');
    expect(rule('body')).toContain('overscroll-behavior: none;');
    expect(css).toMatch(/scroll-padding-bottom: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\) \+ 16px\);/);
  });
  it('main: top/side padding include the insets; bottom padding clears the tab bar + Home indicator', () => {
    const main = rule('main');
    expect(main).toMatch(/padding: calc\(16px \+ var\(--safe-top\)\) max\(16px, var\(--safe-right\)\) calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\) \+ \d+px\) max\(16px, var\(--safe-left\)\);/);
  });
  it('tab bar (.nav): padding-bottom/left/right from the tokens; hidden while the keyboard is open', () => {
    const nav = rule('.nav');
    expect(nav).toContain('padding-bottom: var(--safe-bottom);');
    expect(nav).toContain('padding-left: var(--safe-left);');
    expect(nav).toContain('padding-right: var(--safe-right);');
    expect(nav).not.toContain('env(');
    expect(rule('body.keyboard-open .nav')).toContain('display: none;');
  });
  it('toasts sit above the tab bar + inset and keep clear of the side insets', () => {
    const toast = rule('.toast-region');
    expect(toast).toContain('bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 12px);');
    expect(toast).toContain('padding: 0 max(16px, var(--safe-right)) 0 max(16px, var(--safe-left));');
  });
  it('bottom sheets (< 640 px): max-height below the status bar, button area above the Home indicator', () => {
    const sheet = rule('dialog.dialog', '@media (max-width: 639px)');
    expect(sheet).toContain('max-height: calc(100dvh - 16px - var(--safe-top));');
    expect(sheet).toContain('padding-bottom: calc(24px + var(--safe-bottom));');
    expect(rule('dialog.dialog.signout,\ndialog.dialog.merge')).toContain('max-height: calc(100dvh - 16px - var(--safe-top));');
    expect(rule('.dialog.signout .actions,\n.dialog.merge .actions')).toContain('padding: 16px 24px calc(24px + var(--safe-bottom));');
  });
  it('full-page screens (S8/S9/ErrorBoundary) and the skip link respect the insets', () => {
    expect(rule('.error-page')).toContain('padding: calc(24px + var(--safe-top)) max(16px, var(--safe-right)) calc(24px + var(--safe-bottom)) max(16px, var(--safe-left));');
    expect(rule('.skip:focus')).toContain('top: calc(8px + var(--safe-top));');
  });
  it('the only env(safe-area-inset-*) uses are the token declarations (A-D68)', () => {
    expect(css.match(/env\(safe-area-inset-/g)).toHaveLength(4);
  });
  it('index.html keeps viewport-fit=cover (required for env() to be non-zero in the app)', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
  });
});
