import { describe, expect, it } from 'vitest';
import { charLength } from './text';

describe('charLength counts code points (M10-D1)', () => {
  it('ASCII, combining marks, emoji, astral CJK', () => {
    expect(charLength('')).toBe(0);
    expect(charLength('abc')).toBe(3);
    expect(charLength('😀'.repeat(60))).toBe(60);
    expect('😀'.repeat(60).length).toBe(120);
    expect(charLength('𠮷')).toBe(1);
    expect(charLength('a\u0301')).toBe(2); // a + combining acute: two code points, as SQL char_length and zod count it
    expect(charLength('👨‍👩‍👧')).toBe(5); // ZWJ sequence: 5 code points
  });

  it('equals the code-point count ([...s].length) on random strings; zod/mapper agreement is covered by limits-parity', () => {
    const alphabet = ['a', 'é', 'あ', '😀', '𠮷', '\u0301', ' '];
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2000; i += 1) {
      const n = Math.floor(rand() * 70);
      let s = '';
      for (let k = 0; k < n; k += 1) s += alphabet[Math.floor(rand() * alphabet.length)];
      expect(charLength(s), s).toBe([...s].length);
    }
  });
});
