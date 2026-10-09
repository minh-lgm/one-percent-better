import { describe, expect, it } from 'vitest';
import { parseDecimalInput } from './number-input';

describe('parseDecimalInput (M1-D3)', () => {
  it('accepts plain decimal numbers', () => {
    expect(parseDecimalInput('30')).toBe(30);
    expect(parseDecimalInput(' 30 ')).toBe(30);
    expect(parseDecimalInput('30.0')).toBe(30);
    expect(parseDecimalInput('12.5')).toBe(12.5); // domain rejects non-integers later
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('1440')).toBe(1440);
  });

  it.each(['0x1E', '1e1', '1E1', '0b11', '0o17', '+30', '-3', 'Infinity', 'NaN', '', '   ', 'abc', '1e2x', '30.', '.5', '1_000', '1,000', '３０'])(
    'rejects %j',
    (input) => {
      expect(Number.isNaN(parseDecimalInput(input))).toBe(true);
    },
  );
});
