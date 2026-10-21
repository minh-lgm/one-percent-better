// Capacitor configuration (ARCHITECTURE §5.12, ADR-34). Fixed values; the native web assets come from
// `npm run build:native` (Vite mode `native`: base '/', no service worker, no manifest).
import type { CapacitorConfig } from '@capacitor/cli';

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
};

export default config;
