// The single `import()` into src/integration/native/** (ARCHITECTURE §5.12, ADR-35). `__OPB_NATIVE__` is a
// build-time constant: `false` on the web build (and in Vitest), so the bundler drops the dynamic import
// and emits no Capacitor chunk; `true` only for `--mode native` / `--mode native-e2e`.
import type { FileExportPort } from '../services/file-export-port';

export type EffectiveTheme = 'light' | 'dark';

/** The effective theme (OS `prefers-color-scheme`): current value + change subscription. */
export interface ThemeSource {
  current(): EffectiveTheme;
  subscribe(cb: (theme: EffectiveTheme) => void): () => void;
}

/** M13 (DESIGN "Native shell" 2, 3, 5): status bar follows the theme, splash hidden by the app, keyboard class. */
export interface NativeSystemUi {
  /** Starts the status-bar / keyboard listeners; returns the stop function. */
  start(theme?: ThemeSource): () => void;
  hideSplash(): Promise<void>;
}

export interface NativePlatform {
  platform: 'ios' | 'android';
  /** M12 (§5.15): backup / .ics through the share sheet. */
  fileExport: FileExportPort;
  /** M12: `resume` → same triggers as `visibilitychange`. `onBackButton` arrives with Android (M16). */
  lifecycle: { onResume(cb: () => void): () => void; onBackButton?(cb: () => void): () => void };
  /** M13: present on the real runtime; fakes may omit it. */
  systemUi?: NativeSystemUi;
}

export interface NativeModule {
  createNativePlatform(): NativePlatform | null;
}

/** Testable core: `native = false` never calls `load`; `native = true` loads and asks the runtime (`'web'` → null). */
export async function resolveNativePlatform(native: boolean, load: () => Promise<NativeModule>): Promise<NativePlatform | null> {
  if (!native) return null;
  return (await load()).createNativePlatform();
}

export function loadNativePlatform(): Promise<NativePlatform | null> {
  // The condition must stay a plain compile-time constant (like loader.ts with __OPB_CLOUD__, M10).
  if (__OPB_NATIVE__) return resolveNativePlatform(true, () => import('./native/index'));
  return Promise.resolve(null);
}
