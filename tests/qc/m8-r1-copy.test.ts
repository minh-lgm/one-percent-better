// QC M8 round 1: every row of DESIGN 7.7.4 and 7.7.5 (milestones M6/M7/M8) must exist verbatim in en.json and vi.json,
// plus the Today copy of S1 (banner title/body/toast). Parsed from the markdown tables; shares no code with the app.
// The 7 strings the developer proposed for rows the cloud refused are NOT in DESIGN: listed, not a defect.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import vi from '../../src/i18n/resources/vi.json';

const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');

function lookup(obj: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), obj);
}
const unwrap = (cell: string): string => cell.trim().replace(/^`/, '').replace(/`$/, '');

function section(from: string, to: string): string {
  const lines = design.split(/\r?\n/);
  const a = lines.findIndex((l) => l.startsWith(from));
  const b = lines.findIndex((l, i) => i > a && l.startsWith(to));
  return lines.slice(a, b).join('\n');
}

const text = `${section('#### 7.7.4', '#### 7.7.5')}\n${section('#### 7.7.5', '---')}`;
const rows: Array<{ key: string; ms: string; en: string; vi: string }> = [];
for (const line of text.split(/\r?\n/)) {
  const m = /^\| `([A-Za-z0-9_.]+)` \| (M\d) \|/.exec(line);
  if (!m) continue;
  const cells = line.split(/ \| /).map((c) => c.replace(/^\| /, '').replace(/ \|$/, ''));
  rows.push({ key: m[1] as string, ms: m[2] as string, en: unwrap(cells[cells.length - 2] as string), vi: unwrap(cells[cells.length - 1] as string) });
}

describe('QC M8: DESIGN 7.7.4 / 7.7.5 copy is in the resource files verbatim (en and vi)', () => {
  it('parsed the expected rows (M8 rows >= 7, all rows >= 17)', () => {
    expect(rows.filter((r) => r.ms === 'M8').length).toBeGreaterThanOrEqual(7);
    expect(rows.length).toBeGreaterThanOrEqual(17);
  });
  for (const r of rows) {
    it(`${r.ms} ${r.key}`, () => {
      expect(lookup(en, r.key), `en ${r.key}`).toBe(r.en);
      expect(lookup(vi, r.key), `vi ${r.key}`).toBe(r.vi);
    });
  }
});

describe('QC M8: Today banner copy quoted in S1 and unchanged phase-1 strings', () => {
  it('S1 banner copy equals the keys', () => {
    expect(lookup(en, 'loginPrompt.title')).toBe('Keep your progress safe');
    expect(lookup(en, 'loginPrompt.body')).toBe("Sign in to back up your goals and entries online and use them on all your devices. It's optional.");
    expect(lookup(en, 'loginPrompt.snoozedToast')).toBe('OK. You can sign in any time from Settings.');
  });
  it('phase-1 copy kept for cloud-off (FR-38): backup.desc, about.desc, notProtectedDesc', () => {
    expect(lookup(en, 'settings.about.desc')).toBe('Everything you log stays on this device. No account, no tracking.');
    expect(typeof lookup(en, 'settings.backup.desc')).toBe('string');
    expect(typeof lookup(en, 'settings.storage.notProtectedDesc')).toBe('string');
  });
});

describe('QC M8: the 7 developer-proposed strings (NOT IN DESIGN) have a vi counterpart and use the same placeholders', () => {
  const keys = ['settings.account.localRejected', 'auth.signOut.rejected'];
  for (const k of keys) {
    it(`${k}_other en/vi share {{count}}`, () => {
      expect(String(lookup(en, `${k}_other`))).toContain('{{count}}');
      expect(String(lookup(vi, `${k}_other`))).toContain('{{count}}');
    });
  }
  for (const k of ['auth.signOut.rejectedKeep', 'auth.signOut.rejectedRemove', 'auth.signOut.removeDescRejected']) {
    it(`${k} exists in en and vi`, () => {
      expect(typeof lookup(en, k)).toBe('string');
      expect(typeof lookup(vi, k)).toBe('string');
      expect(lookup(vi, k)).not.toBe(lookup(en, k));
    });
  }
});

describe('QC M8: key parity', () => {
  const flat = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
  it('en and vi have identical key sets (vi has no singular plural form)', () => {
    expect(flat(vi).sort()).toEqual(flat(en).filter((k) => !k.endsWith('_one')).sort());
  });
});
