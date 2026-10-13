import { INTL_TAG, type Locale, type Translator } from './types';

export type CountKey =
  | 'format.goalsCount'
  | 'format.entriesCount'
  | 'format.daysCount'
  | 'format.changesCount'
  | 'sync.indicator.waiting'
  | 'sync.indicator.offline'
  | 'auth.signOut.unsynced'
  | 'auth.signOut.rejected'
  | 'settings.account.localRejected';

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
  /** `October` / `tháng 10` (chart summaries, M4). */
  monthLong(date: string | Date): string;
  /** `October 2026` / `tháng 10 năm 2026` (chart tooltips, M4). */
  monthYear(date: string | Date): string;
  /** Short date without year: `Oct 9` / `9 thg 10` (chart axis/tooltips, DESIGN §7.1). */
  dateMonthDay(date: string | Date): string;
  /** Hours with one decimal: `4.0 h` / `4,0 giờ` (stats, M4). */
  hours(minutes: number): string;
  /**
   * Plural phrase with a locale-formatted number: `1 goal`, `16,000 entries` / `16.000 lần ghi`.
   * The plural form is chosen with `Intl.PluralRules` and passed as i18next `context`
   * (`_one` / `_other`), so `count` can be the already formatted string (M3-D2).
   */
  count(key: CountKey, n: number): string;
  /** `1,440` / `1.440`. */
  number(n: number): string;
  /** `15.5` / `15,5`. */
  decimal1(n: number): string;
  /** `25.8%` / `25,8%`. */
  percent1(n: number): string;
  /**
   * v3 curve percent with an explicit sign (DESIGN §7.1): one decimal, grouped, `+` when ≥ 0
   * (`+0.0`, also for −0), `−` (U+2212) when < 0: `+440.0`, `−40.0`, `+143,900.0` / `+143.900,0`.
   * The `%` comes from the surrounding copy (`{{value}}%`).
   */
  signed1(n: number): string;
  /** `×N` factor body (ARCH §4.5): ≥ 1 → at most 2 decimals without trailing zeros (`5.4`, `1,440`); < 1 → 2 significant digits (`0.6`, `0.00069`). */
  factor(n: number): string;
  /** CurveChart Y-axis label: `0%`, `+500%`, `−50%`, `+1,000%`; |v| ≥ 10,000 → Intl compact (`+144K%` / `+144 N%`). */
  axisPercent(n: number): string;
  /** `20 min` / `20 phút`. */
  minutes(n: number): string;
  /** `2 h 40 min`, `2 h`, `45 min`. */
  duration(minutes: number): string;
  /** `00:25:31` — locale independent. */
  hhmmss(ms: number): string;
  /** `14:05` — 24 h local time, same in both locales (DESIGN §7.1). */
  clock(date: string | Date): string;
  /** v2 sync indicator: `14:05` on the same local day as `now`, otherwise the short date. */
  syncedShort(date: string | Date, now: Date): string;
  /** v2 Account card: `today at 14:05` / `2026-10-08 at 09:30` (`format.todayAt` / `format.dateAt`). */
  syncedAt(date: string | Date, now: Date): string;
}

/** Minus sign for the curve copy (DESIGN §7.1: U+2212, not the ASCII hyphen). */
export const MINUS = '\u2212';

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

function plural(tag: string): Intl.PluralRules {
  let r = pluralRules.get(tag);
  if (!r) {
    r = new Intl.PluralRules(tag);
    pluralRules.set(tag, r);
  }
  return r;
}

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
  // Intl prints an ASCII hyphen-minus; the curve copy uses U+2212 so it reads as "minus" and lines up with "+".
  const signed = (n: number, body: (abs: number) => string) => (n < 0 ? `${MINUS}${body(-n)}` : `+${body(Math.abs(n))}`); // Math.abs: −0 → 0
  const signed1 = (n: number) => signed(n, decimal1);
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
    monthLong(date) {
      return dtf(tag, { month: 'long' }).format(isoToLocalDate(date));
    },
    monthYear(date) {
      return dtf(tag, { month: 'long', year: 'numeric' }).format(isoToLocalDate(date));
    },
    dateMonthDay(date) {
      return dtf(tag, { month: 'short', day: 'numeric' }).format(isoToLocalDate(date));
    },
    hours(minutes) {
      return t('format.hours', { n: decimal1(minutes / 60) });
    },
    count(key, n) {
      // A string `count` disables i18next's own plural lookup; `context` picks the suffix instead.
      return t(key, { count: number(n), context: plural(tag).select(n) });
    },
    number,
    decimal1,
    percent1(n) {
      return t('format.percent', { value: decimal1(n) });
    },
    signed1,
    factor(n) {
      return n >= 1 ? nf(tag, { maximumFractionDigits: 2 }).format(n) : nf(tag, { maximumSignificantDigits: 2 }).format(n);
    },
    axisPercent(n) {
      if (n === 0) return t('format.percent', { value: '0' });
      const body = (abs: number) => (abs >= 10_000 ? nf(tag, { notation: 'compact', maximumFractionDigits: 0 }).format(abs) : number(abs));
      return t('format.percent', { value: signed(n, body) });
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
    clock(date) {
      const d = date instanceof Date ? date : new Date(date);
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    },
    syncedShort(date, now) {
      const d = date instanceof Date ? date : new Date(date);
      return toIso(d) === toIso(now) ? clockOf(d) : dateShort(d);
    },
    syncedAt(date, now) {
      const d = date instanceof Date ? date : new Date(date);
      return toIso(d) === toIso(now) ? t('format.todayAt', { time: clockOf(d) }) : t('format.dateAt', { date: dateShort(d), time: clockOf(d) });
    },
  };
}

function clockOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
