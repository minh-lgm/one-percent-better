// QC M7 round 1 — independent oracle for last-write-wins convergence (M7-AC6 / NFR-12) and directed
// edge cases the developer suite does not pin down. The dev random test only proves A = B = remote;
// here the final state is also compared with a model computed WITHOUT any sync code: every
// successful local write carries a globally unique, increasing timestamp (all device clocks follow
// one global clock), so after full sync the record that must survive is simply the write with the
// greatest timestamp (a delete is a write).
import { afterEach, describe, expect, it } from 'vitest';
import type { GoalInput } from '../../src/domain/goal';
import { FakeRemoteServer } from '../../src/test/fake-remote-store';
import { createDevice, serverSnapshot, U1, type Device } from '../../src/test/two-devices';

const T0 = Date.parse('2026-10-09T03:00:00.000Z');
const READ: GoalInput = { name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rec = Record<string, unknown>;
interface Model { rec: Rec; ts: number; deleted: boolean }

let devices: Device[] = [];
afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

async function make(name: string, server: FakeRemoteServer, now = new Date(T0)) {
  const d = await createDevice(name, server, { now });
  devices.push(d);
  return d;
}

async function runScenario(seed: number, steps: number, allowGoalDelete: boolean): Promise<void> {
  const rand = prng(seed);
  let t = T0;
  const server = new FakeRemoteServer(() => new Date(t));
  const a = await make('A', server);
  const b = await make('B', server);
  const goals = new Map<string, Model>();
  const entries = new Map<string, Model>();
  const retired = new Set<string>();
  const trace: string[] = [];
  const pick = <X>(xs: X[]): X => xs[Math.floor(rand() * xs.length)]!;
  const strip = ({ deletedAt: _d, dirty: _x, ...rest }: Rec) => rest;
  // Record what a successful local write produced: the whole row as the device holds it (whole-record LWW,
  // FR-49), stamped with the global time. The stamp itself is asserted: all clocks follow one global clock.
  const note = async (kind: 'goal' | 'entry', d: Device, id: string) => {
    const raw = (kind === 'goal' ? await d.db.goals.get(id) : await d.db.entries.get(id)) as unknown as Rec;
    expect(raw.updatedAt, `${kind} ${id} stamp`).toBe(new Date(t).toISOString());
    (kind === 'goal' ? goals : entries).set(id, { rec: strip(raw), ts: t, deleted: raw.deletedAt !== null });
  };
  try {
    for (let step = 0; step < steps; step += 1) {
      t += 1000 + Math.floor(rand() * 90_000);
      const d = rand() < 0.5 ? a : b;
      d.clock.now = new Date(t);
      d.online.value = rand() >= 0.25;
      const live = (await d.goals.getAll()).filter((g) => !retired.has(g.id));
      const op = rand();
      if (op < 0.15 || live.length === 0) {
        const r = await d.goalService.create({ ...READ, name: `G${step}` }, d.clock.now);
        if (r.ok) await note('goal', d, r.value.id);
        trace.push(`${d.name}@${t} create goal ${r.ok ? r.value.id.slice(0, 6) : 'fail'}`);
      } else if (op < 0.42) {
        const g = pick(live);
        const r = await d.entryService.add({ goalId: g.id, date: `2026-10-${String(1 + Math.floor(rand() * 8)).padStart(2, '0')}`, minutes: 1 + Math.floor(rand() * 40), note: `s${step}`, source: 'manual' }, d.clock.now);
        if (r.ok) await note('entry', d, r.value.id);
        trace.push(`${d.name}@${t} add entry ${r.ok ? r.value.id.slice(0, 6) : r.errors[0]!.code}`);
      } else if (op < 0.55) {
        const g = pick(live);
        const r = await d.goalService.update(g.id, { ...READ, name: `${g.name.split('~')[0]}~${d.name}${step}` }, d.clock.now);
        if (r.ok) await note('goal', d, g.id);
        trace.push(`${d.name}@${t} rename ${g.id.slice(0, 6)} ${r.ok}`);
      } else if (op < 0.7) {
        const g = pick(live);
        const es = await d.entries.getByGoal(g.id);
        if (es.length > 0) {
          const e = pick(es);
          const r = rand() < 0.5 ? await d.entryService.update(e.id, { minutes: 1 + Math.floor(rand() * 30), note: `u${step}` }, d.clock.now) : await d.entryService.remove(e.id);
          if (r.ok) await note('entry', d, e.id);
          trace.push(`${d.name}@${t} edit/remove entry ${e.id.slice(0, 6)}`);
        }
      } else if (op < 0.78) {
        const g = pick(live);
        const r = await d.goalService.setArchived(g.id, !g.archived, d.clock.now);
        if (r.ok) await note('goal', d, g.id);
        trace.push(`${d.name}@${t} archive ${g.id.slice(0, 6)}`);
      } else if (op < 0.85 && allowGoalDelete) {
        const g = pick(live);
        const r = await d.goalService.remove(g.id);
        if (r.ok) {
          retired.add(g.id);
          await note('goal', d, g.id);
          for (const e of await d.db.entries.where('goalId').equals(g.id).toArray()) if (e.deletedAt !== null && e.updatedAt === new Date(t).toISOString()) await note('entry', d, e.id);
        }
        trace.push(`${d.name}@${t} delete goal ${g.id.slice(0, 6)}`);
      } else {
        const r = await d.sync.syncNow('manual');
        trace.push(`${d.name}@${t} sync ${r.status === 'ran' ? (r.ok ? 'ok' : r.error) : r.why}`);
      }
    }
    a.online.value = true;
    b.online.value = true;
    for (const d of [a, b, a, b]) {
      t += 5000;
      d.clock.now = new Date(t);
      const r = await d.sync.syncNow('manual');
      expect(r, `${d.name} final sync`).toEqual({ status: 'ran', ok: true });
    }

    // Oracle: a goal is live iff its latest write is not a tombstone; an entry iff its latest write is not a
    // tombstone AND its goal is live. Content = the whole row of that latest write.
    const byId = (x: Rec, y: Rec) => String(x.id).localeCompare(String(y.id));
    const expectedGoals = [...goals.values()].filter((m) => !m.deleted).map((m) => m.rec).sort(byId);
    const goalAlive = (id: unknown) => goals.has(String(id)) && !goals.get(String(id))!.deleted;
    const expectedEntries = [...entries.values()].filter((m) => !m.deleted && goalAlive(m.rec.goalId)).map((m) => m.rec).sort(byId);

    const sa = await a.snapshot();
    const sb = await b.snapshot();
    const sr = serverSnapshot(server, U1);
    expect(sa.goals, 'A goals vs oracle').toEqual(expectedGoals);
    expect(sa.entries, 'A entries vs oracle').toEqual(expectedEntries);
    expect(sb, 'B vs A').toEqual(sa);
    expect(sr, 'server vs A').toEqual(sa);
    expect(await a.store.countDirty()).toBe(0);
    expect(await b.store.countDirty()).toBe(0);
  } catch (e) {
    console.error(`oracle scenario failed (seed ${seed}, goalDelete ${allowGoalDelete})` + '\n' + trace.slice(-60).join('\n'));
    throw e;
  }
}

describe('QC oracle: after full sync the surviving record is the write with the greatest timestamp (no goal deletion)', () => {
  for (let i = 0; i < 24; i += 1) {
    const seed = 7_100_000 + i;
    it(`seed ${seed} (180 ops)`, async () => {
      await runScenario(seed, 180, false);
    }, 60_000);
  }
});

describe('QC oracle: with goal deletion (a deleted goal is never touched again by any device, entries die with it)', () => {
  for (let i = 0; i < 24; i += 1) {
    const seed = 7_200_000 + i;
    it(`seed ${seed} (180 ops)`, async () => {
      await runScenario(seed, 180, true);
    }, 60_000);
  }
});

describe('QC directed: delete vs later edit of the same goal on a stale device (A-24)', () => {
  async function setup() {
    let t = T0;
    const server = new FakeRemoteServer(() => new Date(t));
    const a = await make('A', server);
    const b = await make('B', server);
    const g = await a.goalService.create(READ, new Date(t));
    if (!g.ok) throw new Error('setup');
    const e = await a.entryService.add({ goalId: g.value.id, date: '2026-10-05', minutes: 30, note: 'n', source: 'manual' }, new Date(t));
    if (!e.ok) throw new Error('setup');
    await a.sync.syncNow('manual');
    await b.sync.syncNow('manual');
    return { server, a, b, goalId: g.value.id, entryId: e.value.id, tick: (ms: number) => (t += ms), now: () => new Date(t) };
  }

  for (const order of ['A,B,A', 'B,A,B', 'A,B', 'B,A,A,B'] as const) {
    it(`A deletes at t+1m, offline B renames at t+2m, sync order ${order}: the goal comes back everywhere, its deleted entry stays deleted, devices agree`, async () => {
      const s = await setup();
      s.tick(60_000);
      s.a.clock.now = s.now();
      expect((await s.a.goalService.remove(s.goalId)).ok).toBe(true);
      s.tick(60_000);
      s.b.clock.now = s.now();
      expect((await s.b.goalService.update(s.goalId, { ...READ, name: 'Read-B' }, s.now())).ok).toBe(true);
      for (const who of order.split(',')) {
        const d = who === 'A' ? s.a : s.b;
        s.tick(1000);
        d.clock.now = s.now();
        expect(await d.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
      }
      // finish: everyone syncs twice more so the order of the first rounds cannot matter
      for (const d of [s.a, s.b, s.a, s.b]) {
        s.tick(1000);
        d.clock.now = s.now();
        await d.sync.syncNow('manual');
      }
      const sa = await s.a.snapshot();
      const sb = await s.b.snapshot();
      expect(sb).toEqual(sa);
      expect(serverSnapshot(s.server, U1)).toEqual(sa);
      // The later write (B's rename) wins over the earlier delete: the goal lives under B's name.
      expect(sa.goals.map((g) => g.name)).toEqual(['Read-B']);
      // The entry that was cascaded by A's delete is NOT resurrected by B's edit of the goal.
      expect(sa.entries).toEqual([]);
      expect(await s.a.store.countDirty()).toBe(0);
      expect(await s.b.store.countDirty()).toBe(0);
    });
  }

  it('B edits an entry at t+3m, after A deleted its goal at t+1m (B still online-stale): goal stays deleted and the entry dies with it', async () => {
    const s = await setup();
    s.tick(60_000);
    s.a.clock.now = s.now();
    await s.a.goalService.remove(s.goalId);
    s.tick(120_000);
    s.b.clock.now = s.now();
    expect((await s.b.entryService.update(s.entryId, { minutes: 5, note: 'late' }, s.now())).ok).toBe(true);
    for (const d of [s.a, s.b, s.a, s.b]) {
      s.tick(1000);
      d.clock.now = s.now();
      expect(await d.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    }
    expect(await s.a.snapshot()).toEqual({ goals: [], entries: [] });
    expect(await s.b.snapshot()).toEqual({ goals: [], entries: [] });
    expect(serverSnapshot(s.server, U1)).toEqual({ goals: [], entries: [] });
  });

  it('equal updatedAt on both devices with different content: the cloud copy wins, both devices end identical and clean', async () => {
    const s = await setup();
    s.tick(60_000);
    const when = s.now();
    s.a.clock.now = when;
    s.b.clock.now = when;
    await s.a.goalService.update(s.goalId, { ...READ, name: 'Tie-A' }, when);
    await s.b.goalService.update(s.goalId, { ...READ, name: 'Tie-B' }, when);
    for (const d of [s.a, s.b, s.a, s.b]) {
      s.tick(1000);
      d.clock.now = s.now();
      expect(await d.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    }
    const sa = await s.a.snapshot();
    expect(await s.b.snapshot()).toEqual(sa);
    expect(serverSnapshot(s.server, U1)).toEqual(sa);
    expect(sa.goals[0]?.name).toBe('Tie-A'); // A pushed first -> the server keeps A's copy on a tie (FR-49)
  });
});
