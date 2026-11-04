import { useTranslation } from 'react-i18next';
import type { Locale, MessageKey, RoadmapKey, TParams } from '../../i18n/types';

export type TFn = (key: MessageKey, params?: TParams) => string;
/** v8.0 (M17, ADR-53): `t()` bound to the lazy `roadmap` namespace (keys without the `roadmap:` prefix). */
export type RoadmapTFn = (key: RoadmapKey, params?: TParams) => string;

/** Typed `t()` plus the current locale. Re-renders on language change. */
export function useT(): { t: TFn; locale: Locale };
/** The `roadmap` namespace (registered by `ensureRoadmapNamespace` before the route renders); `tm` is the main `t()`. */
export function useT(ns: 'roadmap'): { t: RoadmapTFn; tm: TFn; locale: Locale };
export function useT(ns?: 'roadmap'): { t: TFn | RoadmapTFn; tm?: TFn; locale: Locale } {
  const { t, i18n } = useTranslation(ns);
  const locale: Locale = i18n.language === 'vi' ? 'vi' : 'en';
  if (ns) {
    const tm = ((key: MessageKey, params?: TParams) => String(i18n.t(key, params as never))) as TFn;
    return { t: t as unknown as RoadmapTFn, tm, locale };
  }
  return { t: t as unknown as TFn, locale };
}
