/**
 * DOM scan for untranslated strings (ARCHITECTURE §8 (4), NFR-11c).
 *
 * `scanUntranslated` is deliberately self-contained (no closures, no imports)
 * so Playwright can serialise it with `page.evaluate(scanUntranslated, data)`.
 * Component tests call it directly.
 */

export interface ScanData {
  /** Flattened `en.json` (key → value). */
  en: Record<string, string>;
  /** Flattened `vi.json` (key → value). */
  vi: Record<string, string>;
}

export interface ScanHit {
  text: string;
  reason: string;
}

export const A11Y_ATTRIBUTES = ['aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'title', 'alt'] as const;

export const scanUntranslated = (root: Element | Document, data: ScanData): ScanHit[] => {
  const attrs = ['aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'title', 'alt'];
  const rawKey = /^[a-z]+(\.[A-Za-z0-9_]+)+$/;
  const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build patterns from en values whose vi value differs.
  const patterns: Array<{ key: string; re: RegExp }> = [];
  for (const key of Object.keys(data.en)) {
    const enValue = data.en[key];
    const base = key.replace(/_(one|other)$/, '');
    const viValue = data.vi[key] ?? data.vi[`${base}_other`];
    if (viValue === undefined || norm(viValue) === norm(enValue)) continue;
    const source = norm(enValue)
      .split(/\{\{[^}]+\}\}/)
      .map(escapeRe)
      .join('.+?');
    patterns.push({ key, re: new RegExp(`^${source}$`, 'u') });
  }

  const texts: string[] = [];
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
  const walkerRoot = root.nodeType === 9 ? (root as Document).body : (root as Element);
  if (doc && walkerRoot) {
    const walker = doc.createTreeWalker(walkerRoot, 4 /* NodeFilter.SHOW_TEXT */);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
        const value = norm(node.textContent ?? '');
        if (value) texts.push(value);
      }
      node = walker.nextNode();
    }
    for (const el of Array.from(walkerRoot.querySelectorAll('*'))) {
      for (const attr of attrs) {
        const value = el.getAttribute(attr);
        if (value && norm(value)) texts.push(norm(value));
      }
    }
    if (doc.title) texts.push(norm(doc.title));
  }

  const hits: ScanHit[] = [];
  for (const text of texts) {
    if (rawKey.test(text)) {
      hits.push({ text, reason: 'looks like a raw i18n key' });
      continue;
    }
    const match = patterns.find((p) => p.re.test(text));
    if (match) hits.push({ text, reason: `matches en value of "${match.key}"` });
  }
  return hits;
};
