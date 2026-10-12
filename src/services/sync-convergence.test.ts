// Two devices + one fake cloud converge (M7-AC6, M7-AC17, NFR-12). Scenarios (a)–(f) of the AC and
// a seeded random test: 20 seeds × 200 operations; the seed is printed when a run fails.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GoalInput } from '../domain/goal';
import { FakeRemoteServer, offlineError } from '../test/fake-remote-store';
import { createDevice, serverSnapshot, U1, type Device } from '../test/two-devices';

const T = (s: string) => new Date(s);
const NOW = T('2026-10-09T03:00:00.000Z');
const READ: GoalInput = { name: 'Read', why: 'Be smarter', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

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

async function device(name: string, now = NOW) {
  const d = await createDevice(name, server, { now });
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
            const g = await d.goalService.create({ ...READ, name: `G${step}` }, d.clock.now);
            trace.push(`${d.name} create goal ${g.ok ? g.value.id.slice(0, 8) : 'fail'}`);
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
          } else if (op < 0.78) {
            const g = pick(goals);
            await d.goalService.setArchived(g.id, !g.archived, d.clock.now);
            trace.push(`${d.name} archive toggle ${g.id.slice(0, 8)}`);
          } else if (op < 0.85) {
            const g = pick(goals);
            await d.goalService.remove(g.id);
            trace.push(`${d.name} delete goal ${g.id.slice(0, 8)}`);
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
      } catch (e) {
        console.error(`random convergence failed for seed ${seed}\n${trace.join('\n')}`);
        throw e;
      }
    });
  }
});
