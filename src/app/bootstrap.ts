// Startup sequence (ARCHITECTURE §3, §5.8, §5.9): detect locale → init i18n → open DB
// → resolve saved locale → apply → auth state from kv/storage (no SDK unless a session
// exists) → OAuth callback handled before the router renders → render. No language
// flash: the router only renders after the saved locale is known.
import type { i18n } from 'i18next';
import { StorageError } from '../domain/types';
import { detectLocale } from '../i18n/detect';
import { createI18n, setLocale } from '../i18n/instance';
import type { Locale } from '../i18n/types';
import type { AuthCallbackParams } from '../services/auth-port';
import type { AppContainer } from './container';

export type BootResult = { ok: true; container: AppContainer; i18n: i18n } | { ok: false; error: StorageError; i18n: i18n; detectedLocale: Locale };

export interface BootstrapOptions {
  navigatorLanguage: string | undefined;
  createContainer: (i18n: i18n) => Promise<AppContainer>;
  i18n?: i18n;
  /** Result of `readAuthCallback(location)`; `null` when the URL is not an OAuth callback. */
  authCallback?: AuthCallbackParams | null;
  /** Replaces the callback URL with `<BASE_URL>#<returnTo>` (must run before the hash router is created). */
  cleanCallbackUrl?: () => void;
}

export async function bootstrap({ navigatorLanguage, createContainer, i18n: existing, authCallback = null, cleanCallbackUrl }: BootstrapOptions): Promise<BootResult> {
  const detectedLocale = detectLocale(navigatorLanguage);
  const i18n = existing ?? createI18n({ locale: detectedLocale });
  setLocale(i18n, detectedLocale);

  let container: AppContainer;
  try {
    container = await createContainer(i18n);
  } catch (e) {
    const error = e instanceof StorageError ? e : new StorageError('Startup failed', { cause: e });
    return { ok: false, error, i18n, detectedLocale };
  }

  const locale = await container.localeService.resolve(navigatorLanguage);
  setLocale(i18n, locale);

  // First account state before the first render (DESIGN S7 "Loading": saved account, no flash).
  await container.authService.init({ callbackPending: !!authCallback && container.authService.isAvailable() });
  if (authCallback) {
    // Drop the one-time code from the URL now (a reload must not replay it), then finish in the background;
    // the Account card shows "Signing you in…" meanwhile (A3) and the result arrives as a toast/Alert.
    cleanCallbackUrl?.();
    if (container.authService.isAvailable()) void container.authService.completeCallback(authCallback);
  }
  return { ok: true, container, i18n };
}
