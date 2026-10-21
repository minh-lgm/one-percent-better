import { describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid (M12 QC note: crypto.randomUUID needs a secure context)', () => {
  it('uses crypto.randomUUID when present', () => {
    const api = { randomUUID: vi.fn(() => '11111111-2222-4333-8444-555555555555' as const), getRandomValues: vi.fn() };
    expect(randomUuid(api)).toBe('11111111-2222-4333-8444-555555555555');
    expect(api.getRandomValues).not.toHaveBeenCalled();
  });
  it('falls back to getRandomValues and still produces well-formed, distinct v4 UUIDs', () => {
    const api = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = randomUuid(api);
      expect(id).toMatch(V4);
      seen.add(id);
    }
    expect(seen.size).toBe(200);
  });
  it('default argument is the global crypto', () => {
    expect(randomUuid()).toMatch(V4);
  });
});
