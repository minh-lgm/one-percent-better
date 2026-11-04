// QC round 1 (M17): independent checks of the roadmap domain, backup v2, Dexie v3 migration and goal-delete unlink.
// Oracle numbers are written out by hand from TASKS/PRD (Q1), not read back from the developer's builders.
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES } from '../../src/config/constants';
import { AppDatabase } from '../../src/data/dexie/db';
import { parseBackup } from '../../src/domain/backup';
import type { RoadmapItem } from '../../src/domain/roadmap';
import { attributeMinutes, roadmapView, toListRow } from '../../src/domain/roadmap-progress';
import { createTestContainer, type TestContainer } from '../../src/test/container';

const Q1_TEXT = readFileSync(new URL('../../e2e/fixtures/q1-roadmap-backup.json', import.meta.url), 'utf8');
const V1_TEXT = readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q1 = () => JSON.parse(Q1_TEXT) as Record<string, any>;
const size = (t: string) => new TextEncoder().encode(t).length;
const parse = (o: unknown, today: string = TODAY) => {
  const t = typeof o === 'string' ? o : JSON.stringify(o);
  return parseBackup(t, size(t), today);
};
const err = (o: unknown) => {
  const r = parse(o);
  return r.ok ? { code: 'OK', params: undefined } : { code: r.errors[0]?.code, params: r.errors[0]?.params };
};
const TODAY = '2026-11-04';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});
async function container(): Promise<TestContainer> {
  const tc = await createTestContainer({ permission: 'granted' });
  disposers.push(() => tc.dispose());
  return tc;
}

describe('Q1 oracle from the shipped fixture, numbers written by hand', () => {
  const parsed = parse(q1());
  it('fixture parses as schemaVersion 2 with 6/29 and 1/5/21/5 rows', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const f = parsed.value;
    expect([f.goals.length, f.entries.length, f.roadmaps?.length, f.roadmapPhases?.length, f.roadmapItems?.length, f.roadmapCheckpoints?.length]).toEqual([6, 29, 1, 5, 21, 5]);
  });
  it('W1 270, W2 75, W3 0, total 345 (5.8 h); planned 960 (16 h); 1/21; 125 days; on track', () => {
    if (!parsed.ok) throw new Error('fixture');
    const f = parsed.value;
    const goal = f.goals.find((g) => g.id === 'gq')!;
    const entries = f.entries.filter((e) => e.goalId === 'gq');
    expect(entries.reduce((s, e) => s + e.minutes, 0)).toBe(395); // 50+60+90+120+45+30
    const v = roadmapView({ roadmap: f.roadmaps![0], phases: f.roadmapPhases!, items: f.roadmapItems!, checkpoints: f.roadmapCheckpoints! }, goal, entries, TODAY);
    const ord = v.items;
    expect(v.itemMinutes.get(ord[0].id)).toBe(270); // 10-27 60 + 10-29 90 + 11-01 120
    expect(v.itemMinutes.get(ord[1].id)).toBe(75); // 11-03 45 + 11-04 30
    expect(v.itemMinutes.get(ord[2].id)).toBe(0);
    expect(v.hoursDoneMinutes).toBe(345);
    const row = toListRow(v);
    expect(row.doneCount).toBe(1);
    expect(row.itemCount).toBe(21);
    expect(row.plannedMinutesToDate).toBe(960);
    expect(row.pace.kind).toBe('onTrack');
    expect(row.milestoneDays).toBe(125);
    expect(row.linkState).toBe('linked');
  });
  it('goal gone: linkState missing, hours null', () => {
    if (!parsed.ok) throw new Error('fixture');
    const f = parsed.value;
    const v = roadmapView({ roadmap: f.roadmaps![0], phases: f.roadmapPhases!, items: f.roadmapItems!, checkpoints: f.roadmapCheckpoints! }, null, [], TODAY);
    expect(v.linkState).toBe('missing');
    expect(v.hoursDoneMinutes).toBeNull();
    expect([...v.itemMinutes.values()].every((m) => m === null)).toBe(true);
  });
});

describe('attributeMinutes vs a brute-force day-by-day reference (A-77, A-80, A-82)', () => {
  let seed = 12345;
  const rnd = (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  const d = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
  it('300 random roadmaps: equals reference, sum of items = total', () => {
    for (let t = 0; t < 300; t += 1) {
      const items: RoadmapItem[] = [];
      const count = 1 + rnd(8);
      for (let i = 0; i < count; i += 1) {
        const ps = rnd(30);
        const pe = ps + rnd(10);
        const as = rnd(3) === 0 ? ps + rnd(5) - 2 : null;
        const ae = rnd(3) === 0 ? (as ?? ps) + rnd(8) - 1 : null;
        items.push({ id: `i${i}`, roadmapId: 'r', phaseId: 'p', title: 't', note: '', position: i, plannedStart: d(ps), plannedEnd: d(pe), actualStart: as === null ? null : d(as), actualEnd: ae === null || ae > 33 ? null : d(ae), createdAt: '', updatedAt: '' });
      }
      const entries = Array.from({ length: 12 }, () => ({ date: d(rnd(40)), minutes: 1 + rnd(120) }));
      const today = d(33);
      const r = attributeMinutes(items, entries, today);
      const ref = new Map<string, number>(items.map((i) => [i.id, 0]));
      const perDay = new Map<string, number>();
      for (const e of entries) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.minutes);
      for (const [day, min] of perDay) {
        const cands = items
          .map((it, ord) => {
            const s = it.actualStart ?? it.plannedStart;
            const e = it.actualEnd ?? (it.actualStart ? (it.plannedEnd > today ? it.plannedEnd : today) : it.plannedEnd);
            return { id: it.id, ord, s, e, explicit: it.actualStart !== null || it.actualEnd !== null };
          })
          .filter((c) => c.e >= c.s && day >= c.s && day <= c.e);
        if (!cands.length) continue;
        cands.sort((a, b) => Number(b.explicit) - Number(a.explicit) || (a.s < b.s ? 1 : a.s > b.s ? -1 : 0) || a.ord - b.ord);
        ref.set(cands[0].id, ref.get(cands[0].id)! + min);
      }
      for (const [id, m] of ref) expect(r.byItem.get(id), `trial ${t} ${id}`).toBe(m);
      expect([...r.byItem.values()].reduce((a, b) => a + b, 0)).toBe(r.total);
    }
  });
});

describe('backup v2 parse (strict, integrity, version)', () => {
  it('accepts v1 sample and v2 Q1; schemaVersion 3 is rejected with v', () => {
    expect(parse(V1_TEXT).ok).toBe(true);
    expect(parse(Q1_TEXT).ok).toBe(true);
    expect(err({ ...q1(), schemaVersion: 3 })).toEqual({ code: 'IMPORT_UNSUPPORTED_VERSION', params: { v: '3' } });
    expect(parse({ ...q1(), schemaVersion: 0 }).ok).toBe(false);
  });
  it('integrity: foreign phase, unknown roadmap on checkpoint, duplicate goalId, unknown goalId -> IMPORT_INTEGRITY', () => {
    const a = q1();
    a.roadmapItems[0].phaseId = 'nope';
    expect(err(a).code).toBe('IMPORT_INTEGRITY');
    const b = q1();
    b.roadmapCheckpoints[0].roadmapId = 'ghost';
    expect(err(b).code).toBe('IMPORT_INTEGRITY');
    const c = q1();
    c.roadmaps.push({ ...c.roadmaps[0], id: 'rq2', title: 'second' });
    expect(err(c).code).toBe('IMPORT_INTEGRITY');
    const e = q1();
    e.roadmaps[0].goalId = 'no-such-goal';
    expect(err(e).code).toBe('IMPORT_INTEGRITY');
  });
  it('201-char item title -> outOfRange; unknown key -> IMPORT_INVALID_SCHEMA; __proto__ key does not pollute', () => {
    const a = q1();
    a.roadmapItems[0].title = 'x'.repeat(201);
    expect(err(a)).toEqual({ code: 'IMPORT_INVALID_SCHEMA', params: { variant: 'outOfRange' } });
    const b = q1();
    b.roadmapItems[0].extra = 1;
    expect(err(b).code).toBe('IMPORT_INVALID_SCHEMA');
    parse(Q1_TEXT.replace('"roadmapItems"', '"__proto__": {"polluted": 1}, "roadmapItems"'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('wrong types and ranges in roadmap rows are rejected, never thrown', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cases: Array<(o: any) => void> = [
      (o) => (o.roadmaps[0].weeklyTargetMinutes = 7.5),
      (o) => (o.roadmaps[0].weeklyTargetMinutes = -1),
      (o) => (o.roadmaps[0].weeklyTargetMinutes = '480'),
      (o) => (o.roadmapItems[0].plannedStart = '2026-02-30'),
      (o) => (o.roadmapItems[0].plannedEnd = '2026-10-26'),
      (o) => (o.roadmapItems[0].actualEnd = '2026-11-05'),
      (o) => (o.roadmapCheckpoints[0].score = 33),
      (o) => (o.roadmapCheckpoints[0].score = 7.25),
      (o) => (o.roadmapCheckpoints[0].maxScore = 0),
      (o) => (o.roadmapPhases = null),
      (o) => (o.roadmaps = {}),
      (o) => (o.roadmaps[0].title = '   '),
      (o) => (o.roadmaps[0].title = 'x'.repeat(81)),
    ];
    for (const [i, mutate] of cases.entries()) {
      const o = q1();
      mutate(o);
      expect(() => parse(o), `case ${i}`).not.toThrow();
      expect(parse(o).ok, `case ${i}`).toBe(false);
    }
  });
  it('limits: >5 MiB is too large; 21st roadmap and 21st phase are out of range', () => {
    expect(parseBackup(Q1_TEXT, IMPORT_MAX_BYTES + 1).ok).toBe(false);
    const a = q1();
    for (let i = 0; i < 20; i += 1) a.roadmaps.push({ ...a.roadmaps[0], id: `x${i}`, goalId: null });
    expect(err(a)).toEqual({ code: 'IMPORT_INVALID_SCHEMA', params: { variant: 'outOfRange' } });
    const b = q1();
    for (let i = 0; i < 16; i += 1) b.roadmapPhases.push({ ...b.roadmapPhases[0], id: `xp${i}`, position: 10 + i });
    expect(err(b)).toEqual({ code: 'IMPORT_INVALID_SCHEMA', params: { variant: 'outOfRange' } });
  });
});

describe('backup service on a real container', () => {
  it('export of imported Q1 is schemaVersion 2, 4 arrays, no deletedAt/dirty, re-import round-trips', async () => {
    const { container: c } = await container();
    const prev = await c.backupService.parse(Q1_TEXT, size(Q1_TEXT));
    expect(prev.ok).toBe(true);
    if (!prev.ok) return;
    expect(await c.backupService.import(prev.value, new Date('2026-11-04T03:00:00Z'))).toEqual({ ok: true, value: { goals: 6, entries: 29, roadmaps: 1 } });
    const out = await c.backupService.export(new Date('2026-11-04T03:00:00Z'));
    const f = JSON.parse(out.json);
    expect(f.schemaVersion).toBe(2);
    expect([f.roadmaps.length, f.roadmapPhases.length, f.roadmapItems.length, f.roadmapCheckpoints.length]).toEqual([1, 5, 21, 5]);
    expect(out.json).not.toMatch(/"deletedAt"|"dirty"/);
    const prev2 = await c.backupService.parse(out.json, size(out.json));
    expect(prev2.ok).toBe(true);
    if (!prev2.ok) return;
    await c.backupService.import(prev2.value, new Date('2026-11-04T04:00:00Z'));
    const again = JSON.parse((await c.backupService.export(new Date('2026-11-04T03:00:00Z'))).json);
    for (const k of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints']) expect(again[k]).toEqual(f[k]);
  });

  it('A-87: importing a v1 file keeps the roadmap and unlinks it (goalId null) because gq is gone', async () => {
    const { container: c, db } = await container().then((t) => ({ container: t.container, db: t.container.db }));
    const q = await c.backupService.parse(Q1_TEXT, size(Q1_TEXT));
    if (!q.ok) throw new Error('q1');
    await c.backupService.import(q.value);
    const v1 = await c.backupService.parse(V1_TEXT, size(V1_TEXT));
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    await c.backupService.import(v1.value);
    expect(await db.goals.filter((g) => !g.deletedAt).count()).toBe(5);
    const rq = await db.roadmaps.get('rq');
    expect(rq?.goalId).toBeNull();
    expect(rq?.deletedAt ?? null).toBeNull();
    expect(await db.roadmapItems.count()).toBe(21);
  });

  it('a file that fails parsing leaves all 4 roadmap tables and goals untouched', async () => {
    const { container: c, db } = await container().then((t) => ({ container: t.container, db: t.container.db }));
    const q = await c.backupService.parse(Q1_TEXT, size(Q1_TEXT));
    if (!q.ok) throw new Error('q1');
    await c.backupService.import(q.value);
    const bad = q1();
    bad.roadmapItems[0].phaseId = 'nope';
    const t = JSON.stringify(bad);
    expect((await c.backupService.parse(t, size(t))).ok).toBe(false);
    expect([await db.roadmaps.count(), await db.roadmapPhases.count(), await db.roadmapItems.count(), await db.roadmapCheckpoints.count(), await db.goals.count()]).toEqual([1, 5, 21, 5, 6]);
  });

  it('A-79: deleting the linked goal unlinks the roadmap (dirty, newer updatedAt) and keeps its items', async () => {
    const { container: c, db } = await container().then((t) => ({ container: t.container, db: t.container.db }));
    const q = await c.backupService.parse(Q1_TEXT, size(Q1_TEXT));
    if (!q.ok) throw new Error('q1');
    await c.backupService.import(q.value);
    const before = await db.roadmaps.get('rq');
    await c.goalService.remove('gq');
    const after = await db.roadmaps.get('rq');
    expect(after?.goalId).toBeNull();
    expect(after?.deletedAt ?? null).toBeNull();
    expect(after!.updatedAt > before!.updatedAt).toBe(true);
    expect(after?.dirty).toBe(1);
    expect(await db.roadmapItems.filter((i) => !i.deletedAt).count()).toBe(21);
    expect((await db.goals.get('gq'))?.deletedAt).toBeTruthy();
  });
});

describe('Dexie v2 -> v3 in place (IndexedDB version 20 -> 30)', () => {
  it('keeps goals, entries and kv; adds 4 empty tables', async () => {
    const name = `qc-m17-mig-${Date.now()}`;
    const old = new Dexie(name);
    old.version(1).stores({ goals: 'id', entries: 'id, goalId, date, [goalId+date]', kv: 'key' });
    old.version(2).stores({ goals: 'id, dirty', entries: 'id, goalId, date, [goalId+date], dirty', kv: 'key' });
    await old.open();
    expect(old.verno).toBe(2);
    await old.table('goals').put({ id: 'g1', name: 'Keep me', deletedAt: null, dirty: 0 });
    await old.table('entries').put({ id: 'e1', goalId: 'g1', date: '2026-10-01', minutes: 30, deletedAt: null, dirty: 0 });
    await old.table('kv').put({ key: 'locale', value: 'vi' });
    old.close();
    const db = new AppDatabase(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(db.backendDB().version).toBe(30);
    expect((await db.goals.get('g1'))?.name).toBe('Keep me');
    expect(await db.entries.count()).toBe(1);
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect([await db.roadmaps.count(), await db.roadmapPhases.count(), await db.roadmapItems.count(), await db.roadmapCheckpoints.count()]).toEqual([0, 0, 0, 0]);
    db.close();
    await Dexie.delete(name);
  });
});
