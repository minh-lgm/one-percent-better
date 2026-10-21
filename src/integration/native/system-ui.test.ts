// M13-AC4/AC5: status-bar style follows the effective theme, the keyboard toggles `body.keyboard-open`, and the
// adapter forwards to the plugins (@capacitor/status-bar, splash-screen, keyboard mocked).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: vi.fn(async () => undefined) }, Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })) } }));

import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { EffectiveTheme, ThemeSource } from '../platform';
import { createSystemUi, KEYBOARD_OPEN_CLASS, prefersColorSchemeSource, statusBarStyleFor, type SystemUiDeps } from './system-ui';

function fakeTheme(initial: EffectiveTheme): ThemeSource & { set(t: EffectiveTheme): void; listeners: number } {
  let current = initial;
  const subs = new Set<(t: EffectiveTheme) => void>();
  return {
    current: () => current,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    set(t) {
      current = t;
      subs.forEach((cb) => cb(t));
    },
    get listeners() {
      return subs.size;
    },
  };
}

function fakeBody() {
  const classes = new Set<string>();
  return { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) } as unknown as DOMTokenList, classes };
}

function fakeDeps(theme = fakeTheme('light')) {
  const keyboard = new Map<string, () => void>();
  const removed: string[] = [];
  const body = fakeBody();
  const deps: SystemUiDeps = {
    setStatusBarStyle: vi.fn(async () => undefined),
    hideSplash: vi.fn(async () => undefined),
    addKeyboardListener: vi.fn(async (event: string, cb: () => void) => {
      keyboard.set(event, cb);
      return { remove: async () => void removed.push(event) };
    }),
    body: { classList: body.classList },
    theme,
  };
  return { deps, theme, keyboard, removed, body };
}

afterEach(() => vi.clearAllMocks());

describe('statusBarStyleFor', () => {
  it('dark theme → light text (Style.Dark); light theme → dark text (Style.Light)', () => {
    expect(statusBarStyleFor('dark')).toBe(Style.Dark);
    expect(statusBarStyleFor('light')).toBe(Style.Light);
  });
});

describe('createSystemUi().start', () => {
  it('applies the current theme at start and again on every change; stop unsubscribes', () => {
    const f = fakeDeps(fakeTheme('dark'));
    const stop = createSystemUi(f.deps).start();
    expect(f.deps.setStatusBarStyle).toHaveBeenCalledTimes(1);
    expect(f.deps.setStatusBarStyle).toHaveBeenLastCalledWith(Style.Dark);
    f.theme.set('light');
    expect(f.deps.setStatusBarStyle).toHaveBeenCalledTimes(2);
    expect(f.deps.setStatusBarStyle).toHaveBeenLastCalledWith(Style.Light);
    expect(f.theme.listeners).toBe(1);
    stop();
    expect(f.theme.listeners).toBe(0);
    f.theme.set('dark');
    expect(f.deps.setStatusBarStyle).toHaveBeenCalledTimes(2);
  });

  it('an explicit theme source overrides the default one', () => {
    const f = fakeDeps(fakeTheme('light'));
    const other = fakeTheme('dark');
    createSystemUi(f.deps).start(other);
    expect(f.deps.setStatusBarStyle).toHaveBeenLastCalledWith(Style.Dark);
    expect(other.listeners).toBe(1);
    expect(f.theme.listeners).toBe(0);
  });

  it('keyboardWillShow adds body.keyboard-open, keyboardWillHide removes it; stop removes both listeners and the class', async () => {
    const f = fakeDeps();
    const stop = createSystemUi(f.deps).start();
    expect(f.deps.addKeyboardListener).toHaveBeenCalledTimes(2);
    expect([...f.keyboard.keys()].sort()).toEqual(['keyboardWillHide', 'keyboardWillShow']);
    f.keyboard.get('keyboardWillShow')!();
    expect(f.body.classes.has(KEYBOARD_OPEN_CLASS)).toBe(true);
    f.keyboard.get('keyboardWillHide')!();
    expect(f.body.classes.has(KEYBOARD_OPEN_CLASS)).toBe(false);
    f.keyboard.get('keyboardWillShow')!();
    stop();
    expect(f.body.classes.has(KEYBOARD_OPEN_CLASS)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.removed.sort()).toEqual(['keyboardWillHide', 'keyboardWillShow']);
    // A late event after stop is ignored.
    f.keyboard.get('keyboardWillShow')!();
    expect(f.body.classes.has(KEYBOARD_OPEN_CLASS)).toBe(false);
  });

  it('a runtime without the Keyboard plugin (addListener rejects "not implemented") produces no unhandled rejection; stop still works', async () => {
    const f = fakeDeps();
    f.deps.addKeyboardListener = vi.fn(async () => {
      throw new Error('"Keyboard" plugin is not implemented on ios');
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const stop = createSystemUi(f.deps).start();
      await new Promise((r) => setTimeout(r, 0));
      stop();
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    expect(f.deps.setStatusBarStyle).toHaveBeenCalledTimes(1);
  });

  it('a rejected plugin call does not throw out of start or the theme listener', async () => {
    const f = fakeDeps(fakeTheme('light'));
    f.deps.setStatusBarStyle = vi.fn(async () => {
      throw new Error('not implemented');
    });
    expect(() => createSystemUi(f.deps).start()).not.toThrow();
    expect(() => f.theme.set('dark')).not.toThrow();
    await Promise.resolve();
  });

  it('default deps forward to the Capacitor plugins (StatusBar.setStyle, SplashScreen.hide, Keyboard.addListener)', async () => {
    const theme = fakeTheme('dark');
    const ui = createSystemUi();
    const stop = ui.start(theme);
    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Dark });
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));
    await ui.hideSplash();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('prefersColorSchemeSource', () => {
  it('reads matchMedia("(prefers-color-scheme: dark)") and relays change events until unsubscribed', () => {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const query = {
      matches: true,
      addEventListener: vi.fn((_: 'change', l: (e: { matches: boolean }) => void) => void (listener = l)),
      removeEventListener: vi.fn(() => void (listener = null)),
    };
    const matchMedia = vi.fn(() => query);
    const source = prefersColorSchemeSource(matchMedia);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(source.current()).toBe('dark');
    const seen: EffectiveTheme[] = [];
    const off = source.subscribe((t) => seen.push(t));
    listener!({ matches: false });
    listener!({ matches: true });
    expect(seen).toEqual(['light', 'dark']);
    off();
    expect(query.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listener).toBeNull();
  });
});
