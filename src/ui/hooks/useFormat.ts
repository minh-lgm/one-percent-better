import { useMemo } from 'react';
import { createFormatters, type Formatters } from '../../i18n/format';
import { useT } from './useT';

/** Formatters for the current locale (FR-36). */
export function useFormat(): Formatters {
  const { t, locale } = useT();
  return useMemo(() => createFormatters(locale, { t }), [locale, t]);
}
