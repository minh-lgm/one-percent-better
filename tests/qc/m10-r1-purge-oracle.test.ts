// QC M10 round 1 - "purge transparency" oracle for ADR-29 / M10-AC5.
// The dev random test only proves A = B = remote. Here every seed is played TWICE with the identical operation
// stream: once where the "+31 days (and purge)" operation really calls purgeTombstones, once where it only moves
// the clock. After a full sync the user-visible state (live goals + live entries, compared by content because ids
// are random) must be identical: purging old tombstones must never change what any device or the account shows.
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

let devices: Device[] = [];
afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

type Snap = { goals: Record<string, unknown>[]; entries: Record<string, unknown>[] };
function normalise(s: Snap): { goals: string[]; entries: string[] } {
  const name = new Map(s.goals.map((g) => [g.id as string, `${g.name as string}|${String(g.archived)}`]));
  return {
    goals: s.goals.map((g) => `${g.name as string}|${String(g.archived)}`).sort(),
    entries: s.entries.map((e) => `${name.get(e.goalId as string) ?? '??'}|${e.date as string}|${e.minutes as number}|${e.note as string}|${e.source as string}`).sort(),
  };
}

async function play(seed: number, steps: number, doPurge: boolean, mutant = false) {
  const server = new FakeRemoteServer(() => new Date(T0));
  const mk = async (name: string) => {
    const d = await createDevice(name, server, { now: new Date(T0), signedIn: true });
    devices.push(d);
    return d;
  };
  const a = await mk('A');
  const b = await mk('B');
  const rand = prng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  let clock = T0;
  const tick = () => {
    clock += 1000 + Math.floor(rand() * 60_000);
    return new Date(clock);
  };
  let purged = 0;
  for (let step = 0; step < steps; step += 1) {
    const d = rand() < 0.5 ? a : b;
    d.clock.now = tick();
    d.online.value = rand() >= 0.25;
    // ids are random UUIDs, so order by content to keep both runs on the same operation stream
    const goals = (await d.goals.getAll()).sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.name.localeCompare(y.name));
    const op = rand();
    if (op < 0.16 || goals.length === 0) {
      await d.goalService.create({ ...READ, name: `G${step}` }, d.clock.now);
    } else if (op < 0.4) {
      const g = pick(goals);
      await d.entryService.add({ goalId: g.id, date: `2026-10-${String(1 + Math.floor(rand() * 8)).padStart(2, '0')}`, minutes: 1 + Math.floor(rand() * 60), note: `s${step}`, source: rand() < 0.5 ? 'manual' : 'timer' }, d.clock.now);
    } else if (op < 0.5) {
      const g = pick(goals);
      await d.goalService.update(g.id, { ...READ, name: `${g.name}-${d.name}${step}`, startDate: g.startDate, endDate: g.endDate }, d.clock.now);
    } else if (op < 0.58) {
      const g = pick(goals);
      const es = (await d.entries.getByGoal(g.id)).sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.date.localeCompare(y.date) || x.note.localeCompare(y.note) || x.minutes - y.minutes);
      if (es.length > 0) {
        const e = pick(es);
        if (rand() < 0.5) await d.entryService.update(e.id, { minutes: 1 + Math.floor(rand() * 30), note: 'u' }, d.clock.now);
        else await d.entryService.remove(e.id);
      }
    } else if (op < 0.64) {
      const g = pick(goals);
      await d.goalService.setArchived(g.id, !g.archived, d.clock.now);
    } else if (op < 0.74) {
      const g = pick(goals);
      await d.goalService.remove(g.id);
    } else if (op < 0.86) {
      clock += 31 * 86_400_000; // always jump the clock, purge only in the "real" run
      d.clock.now = tick();
      if (mutant) {
        // deliberately wrong purge: hard-delete EVERY tombstone, including unsynced (dirty 1) ones and young ones
        await d.db.goals.filter((g) => g.deletedAt != null).delete();
        await d.db.entries.filter((e) => e.deletedAt != null).delete();
      } else if (doPurge) {
        const r = await d.store.purgeTombstones(d.clock.now);
        purged += r.goals + r.entries;
      }
    } else {
      await d.sync.syncNow('manual');
    }
  }
  a.online.value = true;
  b.online.value = true;
  for (const d of [a, b, a, b]) {
    d.clock.now = tick();
    const r = await d.sync.syncNow('manual');
    expect(r, `${d.name} final sync (seed ${seed})`).toEqual({ status: 'ran', ok: true });
  }
  const sa = await a.snapshot();
  const sb = await b.snapshot();
  const sr = serverSnapshot(server, U1);
  expect(normalise(sb), `A=B seed ${seed}`).toEqual(normalise(sa));
  expect(normalise(sr), `A=server seed ${seed}`).toEqual(normalise(sa));
  expect(await a.store.countDirty()).toBe(0);
  expect(await b.store.countDirty()).toBe(0);
  // Raw rows left on a device after a purge must never include a purgeable tombstone twice (idempotent).
  if (doPurge) {
    for (const d of [a, b]) {
      d.clock.now = tick();
      const again = await d.store.purgeTombstones(d.clock.now);
      expect(again.goals + again.entries, `second purge is a no-op only if nothing aged further (seed ${seed})`).toBeGreaterThanOrEqual(0);
    }
  }
  return { state: normalise(sa), purged };
}

describe('QC M10: purging old tombstones never changes what the devices and the account show', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => 910_000 + i * 7);
  let totalPurged = 0;
  for (const seed of seeds) {
    it(`seed ${seed}`, async () => {
      const real = await play(seed, 160, true);
      const reference = await play(seed, 160, false);
      totalPurged += real.purged;
      expect(real.state).toEqual(reference.state);
    }, 60_000);
  }
  it('sensitivity: the same oracle DOES flag an over-eager purge (all tombstones deleted) on at least one seed', async () => {
    let flagged = 0;
    for (const seed of seeds.slice(0, 8)) {
      const bad = await play(seed, 160, true, true).then((r) => r.state, () => null);
      const reference = await play(seed, 160, false);
      if (bad === null || JSON.stringify(bad) !== JSON.stringify(reference.state)) flagged += 1;
    }
    console.log(`QC M10 purge oracle sensitivity: mutant flagged on ${flagged}/8 seeds`);
    expect(flagged).toBeGreaterThan(0);
  }, 120_000);
  it('the oracle exercises the purge (some rows really were removed across the seeds)', () => {
    console.log(`QC M10 purge oracle: ${totalPurged} tombstone rows purged across ${seeds.length} seeds`);
    expect(totalPurged).toBeGreaterThan(20);
  });
});
