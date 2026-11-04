// M17-AC7 (FR-77, A-87, ADR-49, NFR-27): export / import of roadmaps through BackupService + DexieBackupRepository.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieRoadmapRepository } from '../data/dexie/roadmap-repo';
import { isLive } from '../data/repositories';
import { datasetQ1, datasetS1, FIXED_NOW_Q1, TODAY_Q1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { BackupService } from './backup-service';
import { SettingsService } from './settings-service';

const fixture = (name: string) => readFileSync(new URL(`../../e2e/fixtures/${name}`, import.meta.url), 'utf8');
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const clock = () => FIXED_NOW_Q1;

let db: AppDatabase;
let signedIn = false;
let service: BackupService;

async function seedQ1() {
  const d = datasetQ1();
  await db.goals.bulkPut(d.goals.map((g) => ({ ...g, deletedAt: null, dirty: 0 as const })));
  await db.entries.bulkPut(d.entries.map((e) => ({ ...e, deletedAt: null, dirty: 0 as const })));
  await new DexieRoadmapRepository(db, { clock }).putMany({ roadmaps: d.roadmaps, phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  for (const t of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints'] as const) await (db[t] as unknown as { toCollection(): { modify(c: object): Promise<number> } }).toCollection().modify({ dirty: 0 });
  return d;
}

async function parseOk(text: string) {
  const r = await service.parse(text, text.length, TODAY_Q1);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  signedIn = false;
  service = new BackupService(new DexieBackupRepository(db, clock), new SettingsService(new DexieKvRepository(db)), () => signedIn);
});
afterEach(() => db.delete());

describe('export (schemaVersion 2)', () => {
  it('Q1 → schemaVersion 2, arrays 1 / 5 / 21 / 5, no deletedAt or dirty; counts() reports roadmaps; import on a fresh database → exportAll deep-equals', async () => {
    const d = await seedQ1();
    expect(await service.counts()).toEqual({ goals: 6, entries: 29, roadmaps: 1 });
    const { json } = await service.export(FIXED_NOW_Q1);
    const file = JSON.parse(json) as Record<string, unknown[]>;
    expect(file.schemaVersion).toBe(2);
    expect([file.roadmaps.length, file.roadmapPhases.length, file.roadmapItems.length, file.roadmapCheckpoints.length]).toEqual([1, 5, 21, 5]);
    expect(json).not.toMatch(/"(deletedAt|dirty)"/);
    const preview = await parseOk(json);
    expect(preview).toMatchObject({ goals: 6, entries: 29, roadmaps: 1 });

    const db2 = createTestDatabase();
    await openDatabase(db2);
    const other = new BackupService(new DexieBackupRepository(db2, clock), new SettingsService(new DexieKvRepository(db2)));
    const r = await other.import(preview, FIXED_NOW_Q1);
    expect(r).toEqual({ ok: true, value: { goals: 6, entries: 29, roadmaps: 1 } });
    const again = await new DexieBackupRepository(db2, clock).exportAll();
    expect(byId(again.roadmaps)).toEqual(byId(d.roadmaps));
    expect(byId(again.roadmapPhases)).toEqual(byId(d.phases));
    expect(byId(again.roadmapItems)).toEqual(byId(d.items));
    expect(byId(again.roadmapCheckpoints)).toEqual(byId(d.checkpoints));
    expect(byId(again.goals)).toEqual(byId(d.goals));
    expect(await db2.roadmapItems.where('dirty').equals(1).count()).toBe(21);
    await db2.delete();
  });

  it('export drops tombstones, children of deleted parents and dangling goal links', async () => {
    const d = await seedQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.deletePhase('pq5');
    await repo.deleteCheckpoint('cq1');
    await db.roadmaps.put({ ...d.roadmap, id: 'r2', title: 'Spanish', goalId: 'ghost', deletedAt: null, dirty: 1 });
    await db.roadmaps.put({ ...d.roadmap, id: 'r3', title: 'Gone', goalId: null, deletedAt: FIXED_NOW_Q1.toISOString(), dirty: 1 });
    await db.roadmapItems.put({ ...d.items[0], id: 'orphan', roadmapId: 'r3', deletedAt: null, dirty: 1 });
    const data = await new DexieBackupRepository(db, clock).exportAll();
    expect(byId(data.roadmaps).map((r) => [r.id, r.goalId])).toEqual([['r2', null], ['rq', 'gq']]);
    expect(data.roadmapPhases).toHaveLength(4);
    expect(data.roadmapItems).toHaveLength(16);
    expect(data.roadmapItems.find((i) => i.id === 'orphan')).toBeUndefined();
    expect(data.roadmapCheckpoints).toHaveLength(4);
  });
});

describe('import', () => {
  it('v1 sample-backup.json while rq links gq: goals/entries = S1, rq kept with goalId null (A-87), dirty 1; preview.roadmaps null', async () => {
    await seedQ1();
    const text = fixture('sample-backup.json');
    const preview = await parseOk(text);
    expect(preview.roadmaps).toBeNull();
    expect(await service.import(preview, FIXED_NOW_Q1)).toEqual({ ok: true, value: { goals: 5, entries: 23, roadmaps: 0 } });
    const s1 = datasetS1();
    const data = await new DexieBackupRepository(db, clock).exportAll();
    expect(byId(data.goals)).toEqual(byId(s1.goals));
    expect(data.entries).toHaveLength(23);
    expect(data.roadmaps.map((r) => [r.id, r.goalId])).toEqual([['rq', null]]);
    expect(data.roadmapItems).toHaveLength(21);
    const row = await db.roadmaps.get('rq');
    expect(row).toMatchObject({ goalId: null, dirty: 1, updatedAt: FIXED_NOW_Q1.toISOString() });
    expect((await db.roadmapItems.get('wq1'))?.dirty).toBe(0); // children untouched
  });

  it('v1 file carrying junk roadmap keys: keys ignored, device roadmaps unchanged (links to g1 kept because g1 is in the file)', async () => {
    const d = await seedQ1();
    await db.roadmaps.update('rq', { goalId: 'g1' });
    const text = fixture('v1-backup-with-roadmap-keys.json');
    const preview = await parseOk(text);
    expect(preview.file.roadmaps).toBeUndefined();
    await service.import(preview, FIXED_NOW_Q1);
    expect(await db.roadmaps.get('junk')).toBeUndefined();
    expect(await db.roadmaps.get('rq')).toMatchObject({ goalId: 'g1', dirty: 0, updatedAt: d.roadmap.updatedAt });
    expect(await db.roadmapItems.filter(isLive).count()).toBe(21);
  });

  it('v2 file replaces the four tables: rows not in the file are soft-deleted (dirty 1), the file rows come in live', async () => {
    await seedQ1();
    const text = fixture('q1-goal-only-backup.json');
    const preview = await parseOk(text);
    expect(preview.roadmaps).toBe(0);
    expect(await service.import(preview, FIXED_NOW_Q1)).toEqual({ ok: true, value: { goals: 6, entries: 29, roadmaps: 0 } });
    expect(await db.roadmaps.filter(isLive).count()).toBe(0);
    expect(await db.roadmapItems.filter(isLive).count()).toBe(0);
    expect((await db.roadmaps.get('rq'))).toMatchObject({ dirty: 1, deletedAt: FIXED_NOW_Q1.toISOString() });
    // Importing the full Q1 file brings them back live.
    const full = await parseOk(fixture('q1-roadmap-backup.json'));
    await service.import(full, FIXED_NOW_Q1);
    expect(await db.roadmaps.filter(isLive).count()).toBe(1);
    expect(await db.roadmapItems.filter(isLive).count()).toBe(21);
  });

  it('signed in + v2 file without rq → rq soft-deleted dirty 1; file rows get updatedAt = import time (FR-51)', async () => {
    await seedQ1();
    signedIn = true;
    const later = new Date('2026-11-04T08:00:00.000Z');
    const q1 = JSON.parse(fixture('q1-roadmap-backup.json')) as { roadmaps: Array<{ id: string }>; roadmapPhases: Array<{ roadmapId: string }>; roadmapItems: Array<{ roadmapId: string }>; roadmapCheckpoints: Array<{ roadmapId: string }> };
    const renamed = { ...q1, roadmaps: [{ ...q1.roadmaps[0], id: 'r-new' }], roadmapPhases: q1.roadmapPhases.map((p) => ({ ...p, roadmapId: 'r-new' })), roadmapItems: q1.roadmapItems.map((i) => ({ ...i, roadmapId: 'r-new' })), roadmapCheckpoints: q1.roadmapCheckpoints.map((c) => ({ ...c, roadmapId: 'r-new' })) };
    const preview = await parseOk(JSON.stringify(renamed));
    await service.import(preview, later);
    expect(await db.roadmaps.get('rq')).toMatchObject({ dirty: 1, deletedAt: FIXED_NOW_Q1.toISOString() }); // soft-delete stamp = repository clock, as for goals
    expect(await db.roadmaps.get('r-new')).toMatchObject({ dirty: 1, deletedAt: null, updatedAt: later.toISOString() });
    expect((await db.roadmapItems.get('wq1'))).toMatchObject({ roadmapId: 'r-new', updatedAt: later.toISOString() });
    expect((await db.goals.get('gq'))?.updatedAt).toBe(later.toISOString());
  });

  it('a failing import leaves all four tables untouched (parse errors never reach the database; a repository failure rolls back)', async () => {
    const d = await seedQ1();
    const q1 = JSON.parse(fixture('q1-roadmap-backup.json')) as { roadmapItems: Array<{ phaseId: string }> };
    const broken = JSON.stringify({ ...q1, roadmapItems: [{ ...q1.roadmapItems[0], phaseId: 'ghost' }, ...q1.roadmapItems.slice(1)] });
    const r = await service.parse(broken, broken.length, TODAY_Q1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('IMPORT_INTEGRITY');
    // Duplicate ids inside the file pass the parser's per-collection check? No — but a duplicate that slips to bulkAdd must roll back.
    const preview = await parseOk(fixture('q1-roadmap-backup.json'));
    const dup = { ...preview, file: { ...preview.file, roadmapItems: [...preview.file.roadmapItems!, preview.file.roadmapItems![0]] } };
    await expect(service.import(dup, FIXED_NOW_Q1)).rejects.toThrow();
    expect(byId((await new DexieBackupRepository(db, clock).exportAll()).roadmapItems)).toEqual(byId(d.items));
    expect((await db.roadmaps.get('rq'))).toMatchObject({ goalId: 'gq', dirty: 0 });
    expect(await db.goals.filter(isLive).count()).toBe(6);
  });
});
