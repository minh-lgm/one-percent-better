// QC M10 round 2 - M10-D3 verification: an impossible / malformed calendar date in a backup file is a structured
// IMPORT_INVALID_SCHEMA (the generic sentence, never the outOfRange variant), never an exception out of BackupService.parse.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BackupService } from '../../src/services/backup-service';
import { errorMessage } from '../../src/ui/error-messages';
import type { DomainError } from '../../src/domain/types';

type Backup = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; [k: string]: unknown };
const SAMPLE = readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8');
const base = (): Backup => JSON.parse(SAMPLE) as Backup;

const service = new BackupService({ exportAll: async () => ({ goals: [], entries: [], settings: {} }), replaceAll: async () => undefined } as never, {} as never);
const formatters = { count: (_k: string, n: number) => String(n), date: (d: string) => d, number: (n: number) => String(n) } as never;

async function parse(file: unknown) {
  const text = JSON.stringify(file);
  return service.parse(text, new TextEncoder().encode(text).length, '2026-10-09');
}
/** i18n key that reaches the Alert for the first error. */
const keyOf = (e: DomainError) => errorMessage(e, formatters).key;

describe('M10-D3 (r2): impossible dates are structured schema errors', () => {
  const BAD = ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2100-02-29', '2026-1-5', '2026-02-3O', '', 'hello', ' 2026-02-03', '2026-02-03T00:00:00Z', '0000-01-01', '9999-99-99', '+010000-01-01', '２０２６-０２-０３'];
  for (const field of ['startDate', 'endDate'] as const) {
    for (const bad of BAD) {
      it(`goal.${field} = ${JSON.stringify(bad)}`, async () => {
        const f = base();
        f.goals[0]![field] = bad;
        const r = await parse(f).then(
          (x) => ({ thrown: null as string | null, x }),
          (e: unknown) => ({ thrown: `${(e as Error).name}: ${(e as Error).message}`, x: null }),
        );
        expect(r.thrown, 'must not throw').toBeNull();
        const res = r.x!;
        expect(res.ok).toBe(false);
        if (!res.ok) {
          const first = res.errors[0]!;
          expect(first.code).toBe('IMPORT_INVALID_SCHEMA');
          expect(keyOf(first), 'generic sentence, not the outOfRange variant').toBe('errors.IMPORT_INVALID_SCHEMA');
        }
      });
    }
  }

  it('the three dates named in the round 2 brief, in both positions, give IMPORT_INVALID_SCHEMA and the generic message key', async () => {
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01']) {
      for (const field of ['startDate', 'endDate'] as const) {
        const f = base();
        f.goals[0]![field] = bad;
        const res = await parse(f);
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.errors[0]!.code).toBe('IMPORT_INVALID_SCHEMA');
          expect(keyOf(res.errors[0]!), `${field}=${bad}`).toBe('errors.IMPORT_INVALID_SCHEMA');
        }
      }
    }
  });

  it('entry.date impossible -> structured error, not an exception', async () => {
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', 'x']) {
      const f = base();
      f.entries[0]!.date = bad;
      const res = await parse(f);
      expect(res.ok, bad).toBe(false);
      if (!res.ok) expect(['IMPORT_INVALID_SCHEMA', 'IMPORT_INTEGRITY']).toContain(res.errors[0]!.code);
    }
  });

  it('non-string dates (number, null, object, array, boolean) do not throw', async () => {
    for (const bad of [20260101, null, {}, [], true, 1e21]) {
      for (const field of ['startDate', 'endDate'] as const) {
        const f = base();
        f.goals[0]![field] = bad;
        const res = await parse(f);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.errors[0]!.code).toBe('IMPORT_INVALID_SCHEMA');
      }
    }
  });

  it('valid edge dates are still accepted: leap day 2024-02-29 and 2028-02-29 as startDate', async () => {
    const f = base();
    f.goals[0]!.startDate = '2024-02-29';
    f.goals[0]!.endDate = '2024-03-31';
    f.entries = [];
    const res = await parse(f);
    expect(res.ok).toBe(true);
  });

  it('a too-long but real period is still the outOfRange variant (the structural flag does not leak)', async () => {
    const f = base();
    f.goals[0]!.startDate = '2000-01-01';
    f.goals[0]!.endDate = '2099-12-31';
    const res = await parse(f);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(keyOf(res.errors[0]!)).toBe('errors.IMPORT_INVALID_SCHEMA_outOfRange');
  });

  it('a malformed date mixed with an out-of-range value stays the generic sentence', async () => {
    const f = base();
    f.goals[0]!.startDate = '2026-02-30';
    f.goals[0]!.targetMinutes = 600_000;
    const res = await parse(f);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(keyOf(res.errors[0]!)).toBe('errors.IMPORT_INVALID_SCHEMA');
  });

  it('fuzz: 3000 random date-like strings in startDate / endDate / entry.date never throw', async () => {
    let s = 7;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const alphabet = ['0', '1', '2', '3', '9', '-', '-', 'T', 'Z', ' ', ':', 'x', '+', '.'];
    let accepted = 0;
    for (let i = 0; i < 3000; i += 1) {
      const len = Math.floor(rand() * 12);
      let v = '';
      if (rand() < 0.5) {
        // near-valid shapes: YYYY-MM-DD with random digits
        v = `${String(Math.floor(rand() * 10000)).padStart(4, '0')}-${String(Math.floor(rand() * 15)).padStart(2, '0')}-${String(Math.floor(rand() * 35)).padStart(2, '0')}`;
      } else {
        for (let j = 0; j < len; j += 1) v += alphabet[Math.floor(rand() * alphabet.length)];
      }
      const f = base();
      const where = i % 3;
      if (where === 0) f.goals[0]!.startDate = v;
      else if (where === 1) f.goals[0]!.endDate = v;
      else f.entries[0]!.date = v;
      let res;
      try {
        res = await parse(f);
      } catch (e) {
        throw new Error(`threw for ${JSON.stringify(v)} at ${where}: ${String(e)}`, { cause: e });
      }
      if (res.ok) accepted += 1;
    }
    expect(accepted).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
