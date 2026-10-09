import i18next, { type i18n } from 'i18next';
import en from './resources/en.json';
import vi from './resources/vi.json';
import type { Locale, MessageKey, TParams, Translator } from './types';

export interface CreateI18nOptions {
  locale: Locale;
  /** When true, a missing key throws instead of returning the key (used in tests). */
  strictMissingKeys?: boolean;
}

export class MissingTranslationError extends Error {
  constructor(key: string) {
    super(`Missing translation key: ${key}`);
    this.name = 'MissingTranslationError';
  }
}

/**
 * Create an initialised i18next instance. Resources are bundled statically, so
 * initialisation is synchronous (`initImmediate: false`).
 */
export function createI18n({ locale, strictMissingKeys = false }: CreateI18nOptions): i18n {
  const instance = i18next.createInstance();
  // init is synchronous here because no backend is used and initAsync is false.
  void instance.init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    defaultNS: 'translation',
    returnNull: false,
    returnEmptyString: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key: string) => {
      if (strictMissingKeys) throw new MissingTranslationError(key);
      return key;
    },
  });
  return instance;
}

/** Apply a locale to the i18next instance and the document (ARCHITECTURE §5.8). */
export function setLocale(instance: i18n, locale: Locale): void {
  if (instance.language !== locale) {
    void instance.changeLanguage(locale);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function currentLocale(instance: i18n): Locale {
  return instance.language === 'vi' ? 'vi' : 'en';
}

/** Translator for code outside React. Reads the current language on every call. */
export function createTranslator(instance: i18n): Translator {
  return {
    get locale() {
      return currentLocale(instance);
    },
    t(key: MessageKey, params?: TParams): string {
      return String(instance.t(key, params as never));
    },
  };
}
