// QC M20 r1 (task 5): which en values does the new "en value equals ANY vi value" rule of src/test/i18n-scan.ts hide from the vi-leak scan?
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import vi from '../../src/i18n/resources/vi.json';
import roadmapEn from '../../src/i18n/resources/roadmap.en.json';
import roadmapVi from '../../src/i18n/resources/roadmap.vi.json';
import { flattenMessages } from '../../src/i18n/parity';

const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
describe('i18n scan rule: en value == some vi value', () => {
  it('lists the masked keys', () => {
    const E = { ...flattenMessages(en), ...flattenMessages(roadmapEn, 'roadmap') } as Record<string, string>;
    const V = { ...flattenMessages(vi), ...flattenMessages(roadmapVi, 'roadmap') } as Record<string, string>;
    const viValues = new Map<string, string[]>();
    for (const [k, v] of Object.entries(V)) viValues.set(norm(v), [...(viValues.get(norm(v)) ?? []), k]);
    const masked: string[] = [];
    for (const [key, enValue] of Object.entries(E)) {
      const base = key.replace(/_(one|other)$/, '');
      const viValue = V[key] ?? V[`${base}_other`];
      if (viValue === undefined || norm(viValue) === norm(enValue)) continue; // never scanned anyway
      const hit = viValues.get(norm(enValue));
      if (hit) masked.push(`${key} = "${enValue}"  <- also vi value of ${hit.join(', ')}`);
    }
    console.log('MASKED', masked.length, '\n' + masked.join('\n'));
    // tripwire: today exactly one key is hidden by the new rule (a language name). A second one = review it by hand.
    expect(masked.map((m) => m.split(' = ')[0])).toEqual(['roadmap.tpl.languageName']);
  });
});
