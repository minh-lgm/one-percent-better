import { useTranslation } from 'react-i18next';
import type { Locale, MessageKey, TParams } from '../../i18n/types';

export type TFn = (key: MessageKey, params?: TParams) => string;

/** Typed `t()` plus the current locale. Re-renders on language change. */
export function useT(): { t: TFn; locale: Locale } {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'vi' ? 'vi' : 'en';
  return { t: t as unknown as TFn, locale };
}
