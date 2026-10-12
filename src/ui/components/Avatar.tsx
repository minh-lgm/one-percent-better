/** First grapheme of the name (fallback: email, then `?`), upper-cased for the locale (DESIGN 3.5, A-D29). */
export function initialOf(name: string, email: string, locale: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  let first: string | undefined;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    first = seg.segment(source)[Symbol.iterator]().next().value?.segment;
  }
  first ??= Array.from(source)[0];
  return (first ?? '?').toLocaleUpperCase(locale);
}

/** 40 px circle with the initial; decorative (no Google photo, FR-42). */
export function Avatar({ name, email, locale }: { name: string; email: string; locale: string }) {
  return (
    <span className="avatar" aria-hidden="true" data-testid="avatar">
      {initialOf(name, email, locale)}
    </span>
  );
}
