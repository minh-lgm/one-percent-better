// Capacitor configuration (ARCHITECTURE §5.12, ADR-34). Fixed values; the native web assets come from
// `npm run build:native` (Vite mode `native`: base '/', no service worker, no manifest).
import type { CapacitorConfig } from '@capacitor/cli';
// Type-only: the plugin module is not loaded when the CLI reads this file; the literal below is what the
// static test (M13-AC5) and the native runtime read.
import type { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'io.github.minhlgm.onepercentbetter',
  appName: '1% Better',
  webDir: 'dist-native',
  ios: {
    // The app draws its own safe areas (DESIGN v5.0 "Native shell"); the WebView must not add insets.
    contentInset: 'never',
    // DESIGN §6.1 `--bg` (light); the page background covers it as soon as the CSS loads.
    backgroundColor: '#F7F6F2',
  },
  plugins: {
    // M13 (DESIGN "Native shell" 2): the launch image stays until the first React render, then
    // src/integration/native/system-ui.ts hides it (3 s fallback); no spinner, same background as the storyboard.
    SplashScreen: { launchAutoHide: false, backgroundColor: '#F7F6F2', showSpinner: false },
    // M13 (DESIGN "Native shell" 5): the web view shrinks when the keyboard opens so the focused input stays
    // visible; switch to 'body' if NV-13 shows the tab bar jumping (ARCH §5.12).
    Keyboard: { resize: 'native' as KeyboardResize, resizeOnFullScreen: true },
  },
};

export default config;
