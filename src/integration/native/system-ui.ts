// System UI of the native shell (TASKS M13-T4; DESIGN v5.0 "Native shell" 2, 3, 5; ARCHITECTURE §5.12):
// status-bar text follows the effective theme (prefers-color-scheme), the launch image is hidden by the app
// (`launchAutoHide: false`, see capacitor.config.ts) and the bottom tab bar hides while the keyboard is open
// (`body.keyboard-open`, OQ-D25). Everything the plugins do is injectable so the unit tests run without a runtime.
import type { PluginListenerHandle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { EffectiveTheme, NativeSystemUi, ThemeSource } from '../platform';

export const KEYBOARD_OPEN_CLASS = 'keyboard-open';

type KeyboardEventName = 'keyboardWillShow' | 'keyboardWillHide';

export interface SystemUiDeps {
  setStatusBarStyle: (style: Style) => Promise<void>;
  hideSplash: () => Promise<void>;
  addKeyboardListener: (event: KeyboardEventName, cb: () => void) => Promise<PluginListenerHandle>;
  /** `document.body` (null in environments without a DOM). */
  body: Pick<HTMLElement, 'classList'> | null;
  theme: ThemeSource;
}

interface MediaQueryLike {
  matches: boolean;
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

/** `prefers-color-scheme` as a `ThemeSource` (the OS theme; the app has no switch of its own, DESIGN A-D2). */
export function prefersColorSchemeSource(matchMedia: (query: string) => MediaQueryLike): ThemeSource {
  const query = matchMedia('(prefers-color-scheme: dark)');
  return {
    current: () => (query.matches ? 'dark' : 'light'),
    subscribe(cb) {
      const listener = (event: { matches: boolean }) => cb(event.matches ? 'dark' : 'light');
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
  };
}

/** DESIGN "Native shell" 3: dark background → light status-bar text (`Style.Dark`), light background → `Style.Light`. */
export function statusBarStyleFor(theme: EffectiveTheme): Style {
  return theme === 'dark' ? Style.Dark : Style.Light;
}

const defaultDeps = (): SystemUiDeps => ({
  setStatusBarStyle: (style) => StatusBar.setStyle({ style }),
  hideSplash: () => SplashScreen.hide(),
  // Two calls instead of one: the plugin's `addListener` overloads do not accept a union event name.
  addKeyboardListener: (event, cb) => (event === 'keyboardWillShow' ? Keyboard.addListener('keyboardWillShow', cb) : Keyboard.addListener('keyboardWillHide', cb)),
  body: typeof document === 'undefined' ? null : document.body,
  // Without a window (unit tests in Node) the theme is a constant light; the real runtime always has one.
  theme: prefersColorSchemeSource(typeof window === 'undefined' ? () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) : (q) => window.matchMedia(q)),
});

export function createSystemUi(deps: SystemUiDeps = defaultDeps()): NativeSystemUi {
  return {
    start(theme = deps.theme) {
      // A failing plugin call (e.g. the status bar on a runtime without it) must not take the app down.
      const apply = (t: EffectiveTheme) => void deps.setStatusBarStyle(statusBarStyleFor(t)).catch(() => undefined);
      apply(theme.current());
      const unsubscribe = theme.subscribe(apply);

      let active = true;
      const handles: Array<Promise<PluginListenerHandle>> = [];
      const toggle = (open: boolean) => () => {
        if (!active || !deps.body) return;
        if (open) deps.body.classList.add(KEYBOARD_OPEN_CLASS);
        else deps.body.classList.remove(KEYBOARD_OPEN_CLASS);
      };
      handles.push(deps.addKeyboardListener('keyboardWillShow', toggle(true)));
      handles.push(deps.addKeyboardListener('keyboardWillHide', toggle(false)));

      return () => {
        active = false;
        unsubscribe();
        deps.body?.classList.remove(KEYBOARD_OPEN_CLASS);
        // The plugin registers asynchronously; a stop that comes first removes each handle once it lands.
        for (const handle of handles) void handle.then((h) => h.remove()).catch(() => undefined);
      };
    },
    hideSplash: () => deps.hideSplash(),
  };
}
