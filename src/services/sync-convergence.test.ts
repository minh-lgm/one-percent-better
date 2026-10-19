// Two devices + one fake cloud converge (M7-AC6, M7-AC17, NFR-12). Scenarios (a)–(f) of the AC and
// a seeded random test: 20 seeds × 200 operations; the seed is printed when a run fails.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeSyncMeta } from '../data/repositories';
import type { GoalInput } from '../domain/goal';
import { FakeRemoteServer, offlineError } from '../test/fake-remote-store';
import { createDevice, serverSnapshot, U1, type Device } from '../test/two-devices';
import { datasetO1, datasetS1 } from '../test/builders';

const T = (s: string) => new Date(s);
const NOW = T('2026-10-09T03:00:00.000Z');
const READ: GoalInput = { name: 'Read', why: 'Be smarter', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
/** v4.0: the open-ended goal O1 as form input. */
const MEDITATE: GoalInput = { name: 'Meditate', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: null };

let server: FakeRemoteServer;
let devices: Device[] = [];
let serverNow = NOW;

beforeEach(() => {
  serverNow = NOW;
  server = new FakeRemoteServer(() => serverNow);
});

afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

async function device(name: string, now = NOW, signedIn = true) {
  // Devices are "signed in" (kv sync.userId/lastUserId set, as AuthService does): the purge rule of M10 reads it.
  const d = await createDevice(name, server, { now, signedIn });
  devices.push(d);
  return d;
}

async function syncOk(d: Device) {
  const r = await d.sync.syncNow('manual');
  expect(r, `${d.name} sync`).toEqual({ status: 'ran', ok: true });
}

async function expectConverged(a: Device, b: Device) {
  const sa = await a.snapshot();
  const sb = await b.snapshot();
  const sr = serverSnapshot(server, U1);
  expect(sb.goals).toEqual(sa.goals);
  expect(sb.entries).toEqual(sa.entries);
  expect(sr.goals).toEqual(sa.goals);
  expect(sr.entries).toEqual(sa.entries);
  expect(await a.store.countDirty()).toBe(0);
  expect(await b.store.countDirty()).toBe(0);
}

describe('two devices converge (M7-AC6)', () => {
  it('(a) A creates "Read" + 3 entries, sync A, sync B → B holds exactly the same records', async () => {
    const a = await device('A');
    const b = await device('B');
    const g = await a.goalService.create(READ, NOW);
    if (!g.ok) throw new Error('setup');
    for (const [date, minutes] of [['2026-10-05', 30], ['2026-10-06', 20], ['2026-10-07', 10]] as const) {
      expect((await a.entryService.add({ goalId: g.value.id, date, minutes, note: `n${minutes}`, source: 'manual' }, NOW)).ok).toBe(true);
    }
    await syncOk(a);
    await syncOk(b);
    const sb = await b.snapshot();
    expect(sb.goals).toHaveLength(1);
    expect(sb.entries).toHaveLength(3);
    await expectConverged(a, b);
  });

  it('(b) offline rename on A at 10:01, rename on B at 10:02, sync A, B, A → both "Read B"', async () => {
    const a = await device('A');
    const b = await device('B');
    const g = await a.goalService.create(READ, NOW);
    if (!g.ok) throw new Error('setup');
    await syncOk(a);
    await syncOk(b);
    a.online.value = false;
    expect((await a.goalService.update(g.value.id, { ...READ, name: 'Read A' }, T('2026-10-09T03:01:00.000Z'))).ok).toBe(true);
    expect(await a.sync.syncNow('change')).toEqual({ status: 'skipped', why: 'offline' });
    expect((await b.goalService.update(g.value.id, { ...READ, name: 'Read B' }, T('2026-10-09T03:02:00.000Z'))).ok).toBe(true);
    a.online.value = true;
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    expect((await a.goals.getById(g.value.id))?.name).toBe('Read B');
    expect((await b.goals.getById(g.value.id))?.name).toBe('Read B');
    await expectConverged(a, b);
  });

  it('(c) A deletes the goal at 10:05 while B edited one of its entries at 10:03 → gone everywhere, tombstone on the server', async () => {
    const a = await device('A');
    const b = await device('B');
    const g = await a.goalService.create(READ, NOW);
    if (!g.ok) throw new Error('setup');
    const e = await a.entryService.add({ goalId: g.value.id, date: '2026-10-05', minutes: 30, note: '', source: 'manual' }, NOW);
    if (!e.ok) throw new Error('setup');
    await syncOk(a);
    await syncOk(b);
    expect((await b.entryService.update(e.value.id, { minutes: 25, note: 'B' }, T('2026-10-09T03:03:00.000Z'))).ok).toBe(true);
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    expect((await a.goalService.remove(g.value.id)).ok).toBe(true);
    await syncOk(b);
    await syncOk(a);
    await syncOk(b);
    expect(await a.goals.getAll()).toEqual([]);
    expect(await b.goals.getAll()).toEqual([]);
    expect(await a.entries.getByGoal(g.value.id)).toEqual([]);
    expect(await b.entries.getByGoal(g.value.id)).toEqual([]);
    const row = server.rows('goals', U1).find((r) => r.id === g.value.id)!;
    expect(row.deleted_at).toBe('2026-10-09T03:05:00.000Z');
    expect(server.live('entries', U1)).toEqual([]);
    await expectConverged(a, b);
  });

  it('(d) remote offline: B adds 5 entries → status offline, pending 5; remote back, syncNow → pending 0, A gets the 5 entries', async () => {
    const a = await device('A');
    const b = await device('B');
    const g = await a.goalService.create(READ, NOW);
    if (!g.ok) throw new Error('setup');
    await syncOk(a);
    await syncOk(b);
    b.remote.failure = offlineError();
    for (let i = 1; i <= 5; i += 1) await b.entryService.add({ goalId: g.value.id, date: `2026-10-0${i}`, minutes: 10, note: '', source: 'manual' }, NOW);
    const r = await b.sync.syncNow('change');
    expect(r).toEqual({ status: 'ran', ok: false, error: 'SYNC_OFFLINE' });
    expect(b.sync.current()).toMatchObject({ kind: 'offline', pending: 5 });
    b.remote.failure = null;
    await syncOk(b);
    expect(b.sync.current()).toMatchObject({ kind: 'idle', pending: 0 });
    await syncOk(a);
    expect(await a.entries.getByGoal(g.value.id)).toHaveLength(5);
    await expectConverged(a, b);
  });

  it('(e) B\'s clock runs 10 minutes behind: its edit still gets a newer updatedAt (A\'s + 1 ms) and wins everywhere', async () => {
    const a = await device('A');
    const b = await device('B', T('2026-10-09T02:50:00.000Z'));
    const g = await a.goalService.create(READ, T('2026-10-09T03:00:00.000Z'));
    if (!g.ok) throw new Error('setup');
    await syncOk(a);
    await syncOk(b);
    const edit = await b.goalService.update(g.value.id, { ...READ, name: 'From B' }, T('2026-10-09T02:51:00.000Z'));
    expect(edit.ok && edit.value.updatedAt).toBe('2026-10-09T03:00:00.001Z');
    await syncOk(b);
    await syncOk(a);
    expect((await a.goals.getById(g.value.id))?.name).toBe('From B');
    expect((await b.goals.getById(g.value.id))?.name).toBe('From B');
    await expectConverged(a, b);
  });
});

describe('(v2.1) preferences converge per group (M7-AC17)', () => {
  it('A changes the language (10:01) and B the reminder time (10:02) while both are offline → after A, B, A both have vi AND 07:30; later edits win per group', async () => {
    const a = await device('A');
    const b = await device('B');
    await syncOk(a);
    await syncOk(b);
    a.online.value = false;
    b.online.value = false;
    a.clock.now = T('2026-10-09T03:01:00.000Z');
    await a.localeService.set('vi');
    b.clock.now = T('2026-10-09T03:02:00.000Z');
    await b.settingsService.setReminderTime('07:30');
    await b.settingsService.setReminderEnabled(true);
    a.online.value = true;
    b.online.value = true;
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    for (const d of [a, b]) {
      expect(await d.kv.get('locale')).toBe('vi');
      expect(await d.settingsService.get()).toMatchObject({ reminderEnabled: true, reminderTime: '07:30' });
      expect(await d.store.countDirty()).toBe(0);
    }
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    await a.settingsService.setReminderTime('06:00');
    b.clock.now = T('2026-10-09T03:06:00.000Z');
    await b.settingsService.setReminderTime('21:00');
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    expect((await a.settingsService.get()).reminderTime).toBe('21:00');
    expect((await b.settingsService.get()).reminderTime).toBe('21:00');
    expect(await a.kv.get('locale')).toBe('vi');
  });

  it('a device that never chose takes the cloud value; a device that chose before sync (1970 marker) loses to the cloud', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.localeService.set('vi');
    await syncOk(a);
    await syncOk(b);
    expect(await b.kv.get('locale')).toBe('vi');
    const c = await device('C');
    await c.kv.set('locale', 'en');
    await c.kv.set('prefsSync', { reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 } });
    await syncOk(c);
    expect(await c.kv.get('locale')).toBe('vi');
  });
});

// ---- M10-AC5: purging old tombstones locally never breaks convergence (ADR-29, NFR-12) ----

const DAY = 86_400_000;
const LATER = (d: Device, days: number) => {
  d.clock.now = new Date(d.clock.now.getTime() + days * DAY);
  return d.clock.now;
};

async function importS1(d: Device) {
  const s1 = datasetS1();
  const json = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: NOW.toISOString(), goals: s1.goals, entries: s1.entries, settings: {} });
  const preview = await d.backupService.parse(json, json.length);
  if (!preview.ok) throw new Error('setup: S1 did not parse');
  await d.backupService.import(preview.value, d.clock.now);
}

const rawGoal = (d: Device, id: string) => d.db.goals.get(id);

describe('tombstone purge and sync (M10-AC5, ADR-29)', () => {
  it('(a) A deletes G2, both sync; 31 days later A purges → raw G2 gone on A; sync A, B, A → live sets equal, server keeps the tombstone', async () => {
    const a = await device('A');
    const b = await device('B');
    await importS1(a);
    await syncOk(a);
    await syncOk(b);
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    expect((await a.goalService.remove('g2')).ok).toBe(true);
    await syncOk(a);
    await syncOk(b);
    expect(await b.goals.getById('g2')).toBeUndefined();
    LATER(a, 31);
    LATER(b, 31);
    expect(await a.store.purgeTombstones(a.clock.now)).toEqual({ goals: 1, entries: expect.any(Number) });
    expect(await rawGoal(a, 'g2')).toBeUndefined();
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    await expectConverged(a, b);
    expect(server.rows('goals', U1).find((r) => r.id === 'g2')?.deleted_at).toBeTruthy();
    expect(await a.goals.getById('g2')).toBeUndefined();
    // The pull window (120 s before the cursor, ADR-30 c) may re-read the server tombstone and put it back
    // as a synced tombstone; harmless (ADR-29), and the next purge removes it again.
    const back = await rawGoal(a, 'g2');
    if (back) expect(back).toMatchObject({ deletedAt: expect.any(String), dirty: 0 });
    expect((await a.store.purgeTombstones(a.clock.now)).goals).toBe(back ? 1 : 0);
    expect(await rawGoal(a, 'g2')).toBeUndefined();
  });

  it('(b) B was offline before A deleted G2 and never touched it; A purges after 31 days; B comes online → G2 disappears on B, A stays without it', async () => {
    const a = await device('A');
    const b = await device('B');
    await importS1(a);
    await syncOk(a);
    await syncOk(b);
    b.online.value = false;
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    expect((await a.goalService.remove('g2')).ok).toBe(true);
    await syncOk(a);
    LATER(a, 31);
    LATER(b, 31);
    expect((await a.store.purgeTombstones(a.clock.now)).goals).toBe(1);
    b.online.value = true;
    await syncOk(b);
    expect(await b.goals.getById('g2')).toBeUndefined();
    await syncOk(a);
    expect(await a.goals.getById('g2')).toBeUndefined();
    const back = await rawGoal(a, 'g2');
    if (back) expect(back).toMatchObject({ deletedAt: expect.any(String), dirty: 0 });
    await expectConverged(a, b);
  });

  it('(c) like (b) but B edited G2 after the deletion instant → after A, B, A both devices hold G2 with the edit of B (A-24, as before purging existed)', async () => {
    const a = await device('A');
    const b = await device('B');
    await importS1(a);
    await syncOk(a);
    await syncOk(b);
    b.online.value = false;
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    expect((await a.goalService.remove('g2')).ok).toBe(true);
    await syncOk(a);
    const g2 = (await b.goals.getById('g2'))!;
    expect((await b.goalService.update('g2', { name: 'Guitar B', why: g2.why, targetType: g2.targetType, targetValue: g2.targetMinutes, startDate: g2.startDate, endDate: g2.endDate }, T('2026-10-09T03:06:00.000Z'))).ok).toBe(true);
    LATER(a, 31);
    LATER(b, 31);
    expect((await a.store.purgeTombstones(a.clock.now)).goals).toBe(1);
    b.online.value = true;
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    expect((await a.goals.getById('g2'))?.name).toBe('Guitar B');
    expect((await b.goals.getById('g2'))?.name).toBe('Guitar B');
    await expectConverged(a, b);
  });

  it('(d) a device that never signed in deletes a goal, purges after 31 days, then signs in for the first time → the goal never reaches the account, pending = 0', async () => {
    const a = await device('A', NOW, false);
    a.user.id = null;
    const g = await a.goalService.create(READ, NOW);
    if (!g.ok) throw new Error('setup');
    expect((await a.entryService.add({ goalId: g.value.id, date: '2026-10-05', minutes: 30, note: '', source: 'manual' }, NOW)).ok).toBe(true);
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'skipped', why: 'paused' });
    expect((await a.goalService.remove(g.value.id)).ok).toBe(true);
    LATER(a, 31);
    expect(await a.store.purgeTombstones(a.clock.now)).toEqual({ goals: 1, entries: 1 });
    a.user.id = U1;
    await syncOk(a);
    expect(server.rows('goals', U1)).toEqual([]);
    expect(server.rows('entries', U1)).toEqual([]);
    expect(await a.store.countDirty()).toBe(0);
  });

  it('a device that synced keeps its unsynced (dirty 1) tombstones through a purge, so signing in again still pushes the deletion', async () => {
    const a = await device('A');
    await importS1(a);
    await syncOk(a);
    a.online.value = false;
    a.clock.now = T('2026-10-09T03:05:00.000Z');
    expect((await a.goalService.remove('g2')).ok).toBe(true);
    LATER(a, 31);
    expect(await a.store.purgeTombstones(a.clock.now)).toEqual({ goals: 0, entries: 0 });
    expect(await rawGoal(a, 'g2')).toBeDefined();
    a.online.value = true;
    await syncOk(a);
    expect(server.rows('goals', U1).find((r) => r.id === 'g2')?.deleted_at).toBeTruthy();
  });
});

// ---- Random test with a seeded PRNG (mulberry32), no dependency ----

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => 20261009 + i);

describe('random operations converge (NFR-12; 20 seeds × 200 ops)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}`, async () => {
      const rand = prng(seed);
      const a = await device('A');
      const b = await device('B');
      const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
      let clock = NOW.getTime();
      const tick = () => {
        clock += 1000 + Math.floor(rand() * 60_000);
        return new Date(clock);
      };
      const trace: string[] = [];
      try {
        for (let step = 0; step < 200; step += 1) {
          const d = rand() < 0.5 ? a : b;
          d.clock.now = tick();
          // Random connectivity: a device is offline ~20 % of the time (its syncs are then skipped).
          d.online.value = rand() >= 0.2;
          const goals = await d.goals.getAll();
          const op = rand();
          if (op < 0.18 || goals.length === 0) {
            // v4.0 (M11-AC6): about a third of the goals have no end date.
            const open = rand() < 0.34;
            const g = await d.goalService.create({ ...READ, name: `G${step}`, endDate: open ? null : READ.endDate }, d.clock.now);
            trace.push(`${d.name} create ${open ? 'open-ended ' : ''}goal ${g.ok ? g.value.id.slice(0, 8) : 'fail'}`);
          } else if (op < 0.45) {
            const g = pick(goals);
            const r = await d.entryService.add({ goalId: g.id, date: `2026-10-${String(1 + Math.floor(rand() * 8)).padStart(2, '0')}`, minutes: 1 + Math.floor(rand() * 60), note: `s${step}`, source: rand() < 0.5 ? 'manual' : 'timer' }, d.clock.now);
            trace.push(`${d.name} add entry on ${g.id.slice(0, 8)} → ${r.ok ? 'ok' : r.errors[0].code}`);
          } else if (op < 0.6) {
            const g = pick(goals);
            const r = await d.goalService.update(g.id, { ...READ, name: `${g.name}-${d.name}${step}`, startDate: g.startDate, endDate: g.endDate }, d.clock.now);
            trace.push(`${d.name} rename ${g.id.slice(0, 8)} → ${r.ok ? 'ok' : r.errors[0].code}`);
          } else if (op < 0.7) {
            const g = pick(goals);
            const es = await d.entries.getByGoal(g.id);
            if (es.length > 0) {
              const e = pick(es);
              const r = rand() < 0.5 ? await d.entryService.update(e.id, { minutes: 1 + Math.floor(rand() * 30), note: 'u' }, d.clock.now) : await d.entryService.remove(e.id);
              trace.push(`${d.name} edit/remove entry ${e.id.slice(0, 8)} → ${r.ok ? 'ok' : r.errors[0].code}`);
            }
          } else if (op < 0.74) {
            // v4.0 (M11-AC6): switch the end date on/off (entries are dated 10-01 … 10-08, inside both periods).
            const g = pick(goals);
            const r = await d.goalService.update(g.id, { ...READ, name: g.name, startDate: g.startDate, endDate: g.endDate === null ? '2026-12-31' : null }, d.clock.now);
            trace.push(`${d.name} end date ${g.endDate === null ? 'set' : 'removed'} on ${g.id.slice(0, 8)} → ${r.ok ? 'ok' : r.errors[0].code}`);
          } else if (op < 0.78) {
            const g = pick(goals);
            await d.goalService.setArchived(g.id, !g.archived, d.clock.now);
            trace.push(`${d.name} archive toggle ${g.id.slice(0, 8)}`);
          } else if (op < 0.85) {
            const g = pick(goals);
            await d.goalService.remove(g.id);
            trace.push(`${d.name} delete goal ${g.id.slice(0, 8)}`);
          } else if (op < 0.9) {
            // M10 (ADR-29): time jumps 31 days and this device purges its old tombstones.
            clock += 31 * 86_400_000;
            d.clock.now = tick();
            const purged = await d.store.purgeTombstones(d.clock.now);
            trace.push(`${d.name} +31d purge → ${purged.goals} goals, ${purged.entries} entries`);
          } else {
            const r = await d.sync.syncNow('manual');
            trace.push(`${d.name} sync → ${r.status === 'ran' ? (r.ok ? 'ok' : r.error) : r.why}`);
          }
        }
        a.online.value = true;
        b.online.value = true;
        a.clock.now = tick();
        b.clock.now = tick();
        await syncOk(a);
        await syncOk(b);
        await syncOk(a);
        await expectConverged(a, b);
        expect(trace.some((t) => t.includes('open-ended')), 'the run exercised open-ended goals').toBe(true);
      } catch (e) {
        console.error(`random convergence failed for seed ${seed}\n${trace.join('\n')}`);
        throw e;
      }
    });
  }
});

// ---- v4.0 (M11-AC6, M11-AC7): open-ended goals across two devices; a device that ran the old client ----
describe('open-ended goals converge (M11-AC6, FR-57, NFR-12)', () => {
  async function seedO1(d: Device) {
    const g = await d.goalService.create(MEDITATE, d.clock.now);
    if (!g.ok) throw new Error('setup');
    const { entries } = datasetO1();
    for (const e of entries) {
      const r = await d.entryService.add({ goalId: g.value.id, date: e.date, minutes: e.minutes, note: '', source: 'manual' }, d.clock.now);
      if (!r.ok) throw new Error(`setup entry ${e.date}: ${r.errors[0].code}`);
    }
    return g.value.id;
  }

  it('A creates O1 (+ 4 entries), sync A, sync B → B holds the goal with endDate null and the entries', async () => {
    const a = await device('A');
    const b = await device('B');
    const id = await seedO1(a);
    await syncOk(a);
    expect(server.live('goals', U1)[0].end_date).toBeNull();
    await syncOk(b);
    const onB = await b.goals.getById(id);
    expect(onB?.endDate).toBeNull();
    expect(onB && 'endDate' in onB).toBe(true);
    expect(await b.entries.getByGoal(id)).toHaveLength(4);
    await expectConverged(a, b);
  });

  it('B sets an end date (10:01), A removes it later (10:02); sync A, B, A → both open-ended again (LWW)', async () => {
    const a = await device('A');
    const b = await device('B');
    const id = await seedO1(a);
    await syncOk(a);
    await syncOk(b);
    b.clock.now = T('2026-10-09T10:01:00.000Z');
    const closed = await b.goalService.update(id, { ...MEDITATE, endDate: '2026-12-31' }, b.clock.now);
    expect(closed.ok).toBe(true);
    a.clock.now = T('2026-10-09T10:02:00.000Z');
    const reopened = await a.goalService.update(id, MEDITATE, a.clock.now);
    expect(reopened.ok).toBe(true);
    serverNow = T('2026-10-09T10:03:00.000Z');
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    expect((await a.goals.getById(id))?.endDate).toBeNull();
    expect((await b.goals.getById(id))?.endDate).toBeNull();
    expect(server.live('goals', U1).find((g) => g.id === id)?.end_date).toBeNull();
    await expectConverged(a, b);
    // The other order (B later than A) ends with the end date set on both.
    b.clock.now = T('2026-10-09T10:05:00.000Z');
    await b.goalService.update(id, { ...MEDITATE, endDate: '2026-12-31' }, b.clock.now);
    a.clock.now = T('2026-10-09T10:04:00.000Z');
    await a.goalService.update(id, { ...MEDITATE, name: 'Meditate!' }, a.clock.now);
    serverNow = T('2026-10-09T10:06:00.000Z');
    await syncOk(a);
    await syncOk(b);
    await syncOk(a);
    expect((await a.goals.getById(id))?.endDate).toBe('2026-12-31');
    await expectConverged(a, b);
  });

  it('(M11-AC7, ADR-33) a device running the old client skips the NULL row (entries stored but hidden, cursor past it); after updating, one cycle brings the goal and its entries back', async () => {
    const a = await device('A');
    const b = await device('B');
    const id = await seedO1(a);
    await syncOk(a);

    // B is "a phone still on the pre-M11 build": its mapper drops end_date NULL rows.
    b.remote.legacyMapper = true;
    await syncOk(b);
    expect(b.sync.current()).toMatchObject({ kind: 'idle', remoteInvalid: true, remoteSkipped: true });
    expect(await b.goals.getById(id)).toBeUndefined();
    expect((await b.db.entries.toArray()).filter((e) => e.goalId === id && e.deletedAt == null)).toHaveLength(4);
    expect(await b.entries.getByGoal(id)).toEqual([]);
    expect(await b.entries.getByDateRange('2026-10-01', '2026-10-09')).toEqual([]);
    const legacyMeta = normalizeSyncMeta(await b.kv.get('sync'));
    expect(legacyMeta.cursor.goals).toMatchObject({ id });
    // Nothing was tombstoned or pushed: the server still has the goal and the entries.
    expect(server.live('goals', U1).map((g) => g.id)).toEqual([id]);
    expect(server.live('entries', U1)).toHaveLength(4);
    expect(await b.store.countDirty()).toBe(0);

    // B updates to M11: the new mapper reads the row, but the stored cursor is already past it. An old
    // client never wrote `pullResetVersion`, so drop it to simulate the upgrade.
    b.remote.legacyMapper = false;
    await b.kv.update<Record<string, unknown>>('sync', (cur) => {
      const { pullResetVersion: _v, ...rest } = cur ?? {};
      return rest;
    });
    await syncOk(b);
    expect((await b.goals.getById(id))?.endDate).toBeNull();
    expect(await b.entries.getByGoal(id)).toHaveLength(4);
    expect(b.sync.current().remoteInvalid).toBeUndefined();
    expect(normalizeSyncMeta(await b.kv.get('sync')).pullResetVersion).toBe(1);
    await syncOk(a);
    await expectConverged(a, b);
  });
});
