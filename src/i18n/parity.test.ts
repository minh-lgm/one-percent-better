import { describe, expect, it } from 'vitest';
import en from './resources/en.json';
import vi from './resources/vi.json';
import { checkParity, flattenMessages, variablesOf } from './parity';

/**
 * Keys whose `vi` value is intentionally identical to `en` (DESIGN §7.0 rule 5:
 * rows marked "= en"). New entries must be listed in the dev handoff.
 */
export const SAME_VALUE_ALLOWLIST = [
  'app.name',
  'app.shortName',
  'app.brandSuffix',
  'doc.title',
  'settings.language.title',
  'settings.language.option.en',
  'settings.language.option.vi',
  'goalCard.plusOne',
] as const;

describe('translation parity (NFR-11a, M1-AC17)', () => {
  it('en.json and vi.json are in parity', () => {
    const problems = checkParity(flattenMessages(en), flattenMessages(vi), {
      sameValueAllowlist: SAME_VALUE_ALLOWLIST,
    });
    expect(problems).toEqual([]);
  });

  it('flattens nested keys', () => {
    expect(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' });
  });

  it('extracts interpolation variables', () => {
    expect(variablesOf('{{n}} of {{count}} goals')).toEqual(['count', 'n']);
    expect(variablesOf('plain')).toEqual([]);
  });

  it('reports missing, extra, differing variables and empty values', () => {
    const enFx = { 'a.x': 'Hello {{n}}', 'a.y': 'Bye', 'a.z': 'Z', 'c_one': '{{count}} c', 'c_other': '{{count}} cs' };
    const viFx = { 'a.x': 'Chào {{m}}', 'a.z': '', 'b': 'thừa', 'c_other': '{{count}} c' };
    const problems = checkParity(enFx, viFx);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing key "a.y"'),
        expect.stringContaining('extra key "b"'),
        expect.stringContaining('variables differ for "a.x"'),
        expect.stringContaining('empty value for "a.z"'),
      ]),
    );
  });

  it('flags identical values unless allow-listed or letter-free', () => {
    expect(checkParity({ k: 'Same' }, { k: 'Same' })).toEqual([expect.stringContaining('value equals en')]);
    expect(checkParity({ k: 'Same' }, { k: 'Same' }, { sameValueAllowlist: ['k'] })).toEqual([]);
    expect(checkParity({ k: '{{n}}/280' }, { k: '{{n}}/280' })).toEqual([]);
    expect(checkParity({ k: '+1%' }, { k: '+1%' })).toEqual([]);
  });

  it('rejects a vi _one form', () => {
    expect(checkParity({ c_one: '1 c', c_other: '{{count}} cs' }, { c_one: '1 c', c_other: '{{count}} c' })).toEqual([
      expect.stringContaining('_one'),
    ]);
  });
});
