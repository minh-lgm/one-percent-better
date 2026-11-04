import type en from './resources/en.json';
import type roadmapEn from './resources/roadmap.en.json';

export type Locale = 'en' | 'vi';
export const LOCALES: readonly Locale[] = ['en', 'vi'] as const;

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'vi';
}

/** Intl tag per locale (ARCHITECTURE §5.8). */
export const INTL_TAG: Record<Locale, string> = { en: 'en-US', vi: 'vi-VN' };

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type StripPlural<K extends string> = K extends `${infer Base}_one`
  ? Base
  : K extends `${infer Base}_other`
    ? Base
    : K;

/** Every translation key (plural suffixes collapsed to their base key). */
export type MessageKey = StripPlural<Leaves<typeof en>>;

/** v8.0 (M17, ADR-53): keys of the lazy `roadmap` namespace, without the `roadmap:` prefix (`useT('roadmap')`). */
export type RoadmapKey = StripPlural<Leaves<typeof roadmapEn>>;
/** The same keys as the main `t()` sees them (`t('roadmap:list.title')`). */
export type RoadmapMessageKey = `roadmap:${RoadmapKey}`;

export type TParams = Record<string, string | number>;

/** Minimal translator for code that runs outside React (services, notifications). */
export interface Translator {
  readonly locale: Locale;
  t(key: MessageKey, params?: TParams): string;
}
