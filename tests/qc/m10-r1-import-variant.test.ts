// QC M10 round 1 - M10-AC9 / M5-P1: which import failures get the "outOfRange" sentence. Independent of the dev table in
// backup.test.ts: every case is built by mutating the S1 fixture file on disk and goes through BackupService.parse (the
// real lazy path) and the UI mapping (errorMessage) so the key that reaches the Alert is what is asserted.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BackupService } from '../../src/services/backup-service';
import { errorMessage } from '../../src/ui/error-messages';
import type { DomainError } from '../../src/domain/types';

type Json = Record<string, unknown> & { goals: Record<string, unknown>[]; entries: Record<string, unknown>[] };
const SAMPLE = readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8');
const base = (): Json => JSON.parse(SAMPLE) as Json;
const TODAY = '2026-10-09';

const service = new BackupService({ exportAll: async () => ({ goals: [], entries: [], settings: {} }), replaceAll: async () => undefined } as never, {} as never);
const formatters = { count: (_k: string, n: number) => String(n), date: (d: string) => d, number: (n: number) => String(n) } as never;

async function keyFor(file: unknown): Promise<{ code: string; key: string; variant: unknown }> {
  const text = typeof file === 'string' ? file : JSON.stringify(file);
  const r = await service.parse(text, new TextEncoder().encode(text).length, TODAY);
  if (r.ok) return { code: 'OK', key: 'OK', variant: undefined };
  const e = r.errors[0] as DomainError;
  return { code: e.code, key: errorMessage(e, formatters).key, variant: e.params?.variant };
}

const OUT = 'errors.IMPORT_INVALID_SCHEMA_outOfRange';
const GENERIC = 'errors.IMPORT_INVALID_SCHEMA';

describe('outOfRange sentence (value is the right type but outside the app limits)', () => {
  const cases: Array<[string, (f: Json) => void]> = [
    ['daily target 600000', (f) => { f.goals[0]!.targetMinutes = 600_000; }],
    ['daily target 1441', (f) => { f.goals[0]!.targetMinutes = 1441; }],
    ['daily target 0', (f) => { f.goals[0]!.targetMinutes = 0; }],
    ['daily target negative', (f) => { f.goals[0]!.targetMinutes = -5; }],
    ['total target above 10000 h', (f) => { f.goals[0]!.targetType = 'total'; f.goals[0]!.targetMinutes = 10_001 * 60; }],
    ['total target derived daily above 1440', (f) => { f.goals[0]!.targetType = 'total'; f.goals[0]!.targetMinutes = 9000 * 60; f.goals[0]!.startDate = '2026-10-01'; f.goals[0]!.endDate = '2026-10-02'; }],
    ['period 1828 days', (f) => { f.goals[0]!.startDate = '2020-01-01'; f.goals[0]!.endDate = '2025-01-02'; }],
    ['period 100 years', (f) => { f.goals[0]!.startDate = '2000-01-01'; f.goals[0]!.endDate = '2099-12-31'; }],
    ['name 61 chars', (f) => { f.goals[0]!.name = 'x'.repeat(61); }],
    ['name only spaces', (f) => { f.goals[0]!.name = '    '; }],
    ['why 281 chars', (f) => { f.goals[0]!.why = 'y'.repeat(281); }],
    ['entry minutes 1441', (f) => { f.entries[0]!.minutes = 1441; }],
    ['entry minutes 0', (f) => { f.entries[0]!.minutes = 0; }],
    ['entry minutes 12.5', (f) => { f.entries[0]!.minutes = 12.5; }],
    ['entry note 281 chars', (f) => { f.entries[0]!.note = 'n'.repeat(281); }],
    ['two range violations in two rows', (f) => { f.goals[0]!.name = 'x'.repeat(61); f.entries[1]!.minutes = 5000; }],
  ];
  for (const [label, mutate] of cases) {
    it(label, async () => {
      const f = base();
      mutate(f);
      expect(await keyFor(f)).toEqual({ code: 'IMPORT_INVALID_SCHEMA', key: OUT, variant: 'outOfRange' });
    });
  }
  it('exactly at the limits is accepted (name 60, why 280, note 280, minutes 1440, daily 1440, period 1827 days)', async () => {
    const f = base();
    f.goals[0]!.name = 'x'.repeat(60);
    f.goals[0]!.why = 'y'.repeat(280);
    f.goals[0]!.targetMinutes = 1440;
    f.goals[0]!.startDate = '2021-01-01';
    f.goals[0]!.endDate = '2025-12-31'; // 1826 days inclusive
    f.entries[0]!.note = 'n'.repeat(280);
    f.entries[0]!.minutes = 1440;
    f.entries = f.entries.filter((e) => e.goalId !== f.goals[0]!.id || e === f.entries[0]);
    f.entries[0]!.date = '2021-01-01';
    expect((await keyFor(f)).code).toBe('OK');
  });
});

describe('generic sentence (the file is not shaped like a backup, or mixes shape and range problems)', () => {
  const cases: Array<[string, unknown]> = [
    ['not JSON at all', '{abc'],
    ['root is an array', []],
    ['other app', { ...base(), app: 'other-app' }],
    ['minutes is a string', (() => { const f = base(); f.entries[0]!.minutes = '30'; return f; })()],
    ['minutes is null', (() => { const f = base(); f.entries[0]!.minutes = null; return f; })()],
    ['targetMinutes is a string', (() => { const f = base(); f.goals[0]!.targetMinutes = '30'; return f; })()],
    ['goal id 65 chars', (() => { const f = base(); f.goals[0]!.id = 'i'.repeat(65); return f; })()],
    ['entry goalId 65 chars', (() => { const f = base(); f.entries[0]!.goalId = 'i'.repeat(65); return f; })()],
    ['unknown extra field on a goal', (() => { const f = base(); f.goals[0]!.color = 'red'; return f; })()],
    ['missing field (no archived)', (() => { const f = base(); delete f.goals[0]!.archived; return f; })()],
    ['name is a number', (() => { const f = base(); f.goals[0]!.name = 5; return f; })()],
    ['targetType unknown', (() => { const f = base(); f.goals[0]!.targetType = 'weekly'; return f; })()],
    ['range violation AND a field of the wrong type in another row', (() => { const f = base(); f.goals[0]!.name = 'x'.repeat(61); f.entries[0]!.minutes = '30'; return f; })()],
    ['range violation AND an unknown field in the same row', (() => { const f = base(); f.goals[0]!.name = 'x'.repeat(61); f.goals[0]!.extra = 1; return f; })()],
    ['range violation AND bad exportedAt', (() => { const f = base(); f.goals[0]!.name = 'x'.repeat(61); f.exportedAt = 'soon'; return f; })()],
    ['entry date not a date (entry.date is not a range field)', (() => { const f = base(); f.entries[0]!.date = 'tomorrow'; return f; })()],
  ];
  for (const [label, file] of cases) {
    it(label, async () => {
      const r = await keyFor(file);
      expect(r.variant).toBeUndefined();
      expect(r.key).not.toBe(OUT);
      expect(r.code).toMatch(/^IMPORT_(INVALID_JSON|INVALID_SCHEMA)$/);
    });
  }
  it('JSON syntax error has its own sentence and is not the schema one', async () => {
    expect((await keyFor('{abc')).key).toBe('errors.IMPORT_INVALID_JSON');
  });
  it('unsupported schemaVersion keeps its own sentence', async () => {
    expect((await keyFor({ ...base(), schemaVersion: 2 })).code).toBe('IMPORT_UNSUPPORTED_VERSION');
  });
  it(`${GENERIC} is still the mapping for a plain schema failure`, async () => {
    expect((await keyFor({ ...base(), app: 'x' })).key).toBe(GENERIC);
  });
});

describe('integrity errors are not reworded', () => {
  it('entry dated after today -> IMPORT_INTEGRITY', async () => {
    const f = base();
    f.entries[0]!.date = '2026-10-10';
    expect((await keyFor(f)).code).toBe('IMPORT_INTEGRITY');
  });
  it('endDate before startDate -> IMPORT_INTEGRITY (stays an integrity error, M3-AC9)', async () => {
    const f = base();
    f.goals[0]!.startDate = '2026-10-31';
    f.goals[0]!.endDate = '2026-10-01';
    expect((await keyFor(f)).code).toBe('IMPORT_INTEGRITY');
  });
  it('entry pointing at a missing goal -> IMPORT_INTEGRITY', async () => {
    const f = base();
    f.entries[0]!.goalId = 'ghost';
    expect((await keyFor(f)).code).toBe('IMPORT_INTEGRITY');
  });
});

// M10-D3 (FIXED in round 2, predates M10 - M5 superRefine): a malformed / impossible date is a structured schema error, never a
// RangeError thrown out of parseBackup.
describe('M10-D3: malformed calendar dates must come back as a structured schema error, not as a thrown exception', () => {
  for (const [label, v] of [['2026-02-30', '2026-02-30'], ['hello', 'hello'], ['2026-1-5', '2026-1-5'], ['empty string', '']] as const) {
    for (const field of ['startDate', 'endDate'] as const) {
      it(`goal.${field} = ${label}`, async () => {
        const f = base();
        f.goals[0]![field] = v;
        const result = await keyFor(f).then(
          (r) => r,
          (e: unknown) => ({ code: `THROWN ${(e as Error).name}: ${(e as Error).message}`, key: 'THROWN', variant: undefined }),
        );
        console.log(`QC M10-D3 goal.${field}=${JSON.stringify(v)} -> ${result.code} / ${result.key}`);
        expect(result.code).toBe('IMPORT_INVALID_SCHEMA');
      });
    }
  }
});
