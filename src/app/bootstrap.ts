// Startup sequence (ARCHITECTURE §3, §5.8): detect locale → init i18n → open DB
// → resolve saved locale → apply → render. No language flash: the router only
// renders after the saved locale is known.
import type { i18n } from 'i18next';
import { StorageError } from '../domain/types';
import { detectLocale } from '../i18n/detect';
import { createI18n, setLocale } from '../i18n/instance';
import type { Locale } from '../i18n/types';
import type { AppContainer } from './container';

export type BootResult = { ok: true; container: AppContainer; i18n: i18n } | { ok: false; error: StorageError; i18n: i18n; detectedLocale: Locale };

export interface BootstrapOptions {
  navigatorLanguage: string | undefined;
  createContainer: (i18n: i18n) => Promise<AppContainer>;
  i18n?: i18n;
}

export async function bootstrap({ navigatorLanguage, createContainer, i18n: existing }: BootstrapOptions): Promise<BootResult> {
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
  return { ok: true, container, i18n };
}
