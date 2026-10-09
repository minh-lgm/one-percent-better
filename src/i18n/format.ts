import { INTL_TAG, type Locale, type Translator } from './types';

export interface Formatters {
  readonly locale: Locale;
  /** `Friday, October 9` (en) / `Thứ Sáu, 9 tháng 10` (vi). */
  dateLong(date: string | Date, options?: { withYear?: boolean }): string;
  /** `2026-10-01` (en) / `01/10/2026` (vi). */
  dateShort(date: string | Date): string;
  /** `2026-10-01 – 2026-10-31`. */
  dateRange(start: string | Date, end: string | Date): string;
  weekdayShort(date: string | Date): string;
  monthShort(date: string | Date): string;
  /** `1,440` / `1.440`. */
  number(n: number): string;
  /** `15.5` / `15,5`. */
  decimal1(n: number): string;
  /** `25.8%` / `25,8%`. */
  percent1(n: number): string;
  /** `20 min` / `20 phút`. */
  minutes(n: number): string;
  /** `2 h 40 min`, `2 h`, `45 min`. */
  duration(minutes: number): string;
  /** `00:25:31` — locale independent. */
  hhmmss(ms: number): string;
}

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function dtf(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d:${tag}:${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(tag, options);
    cache.set(key, f);
  }
  return f;
}

function nf(tag: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n:${tag}:${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(tag, options);
    cache.set(key, f);
  }
  return f;
}

/** Parse `YYYY-MM-DD` as a local date (no timezone shift). */
export function isoToLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Locale-aware formatters (ARCHITECTURE §5.8). Strings that need words
 * (`minutes`, `duration`) go through the translator so copy stays in the JSON.
 */
export function createFormatters(locale: Locale, translator: Pick<Translator, 't'>): Formatters {
  const tag = INTL_TAG[locale];
  const t = translator.t.bind(translator);

  const number = (n: number) => nf(tag, { maximumFractionDigits: 0 }).format(n);
  const decimal1 = (n: number) => nf(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const dateShort = (date: string | Date) => {
    const d = isoToLocalDate(date);
    if (locale === 'en') return toIso(d);
    return dtf(tag, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  };

  return {
    locale,
    dateLong(date, options) {
      const d = isoToLocalDate(date);
      const opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
      if (options?.withYear) opts.year = 'numeric';
      return dtf(tag, opts).format(d);
    },
    dateShort,
    dateRange(start, end) {
      return t('format.dateRange', { start: dateShort(start), end: dateShort(end) });
    },
    weekdayShort(date) {
      return dtf(tag, { weekday: 'short' }).format(isoToLocalDate(date));
    },
    monthShort(date) {
      return dtf(tag, { month: 'short' }).format(isoToLocalDate(date));
    },
    number,
    decimal1,
    percent1(n) {
      return t('format.percent', { value: decimal1(n) });
    },
    minutes(n) {
      return t('format.minutes', { n: number(n) });
    },
    duration(minutes) {
      if (minutes < 60) return t('format.minutes', { n: number(minutes) });
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (m === 0) return t('format.durationHours', { h: number(h) });
      return t('format.duration', { h: number(h), m: number(m) });
    },
    hhmmss(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    },
  };
}
