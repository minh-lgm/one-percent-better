// Contract every `RemoteStore` must pass (ARCHITECTURE §5.11, §8; M7-AC5, M7-AC19). Runs with
// `FakeRemoteStore` and `SupabaseRemoteStore` → mock in `npm test`, and with Supabase local in
// `npm run test:db`. The LWW rules of the fake, the mock and the SQL triggers are thus one rule.
import { describe, expect, it } from 'vitest';
import { rewindCursor } from '../domain/sync';
import type { Goal, LogEntry } from '../domain/types';
import type { RemotePrefs, SyncRecord } from '../data/repositories';
import type { RemoteStore } from './remote-store';

export interface ContractHarness {
  /** Store bound to user `u1` or `u2`. */
  as(user: 'u1' | 'u2'): RemoteStore;
  /** Empty every table for every user. */
  reset(): Promise<void>;
  /**
   * Test seed in the cloud's own row shape (snake_case), bypassing LWW and validation. Fake and mock
   * provide it; real Postgres cannot (triggers stamp `server_updated_at`/`user_id`, check constraints
   * reject invalid rows), so the contract parts that need it are skipped there and
   * `tests/db/remote-store.test.ts` asserts the constraints instead.
   */
  seedRaw?(user: 'u1' | 'u2', table: 'goals' | 'entries' | 'settings', rows: Record<string, unknown>[]): Promise<void>;
  /** The server's clock, when the harness controls it (lets the window test skip waiting). Optional. */
  now?(): Date;
}

const G = (id: string, updatedAt: string, name = `Goal ${id}`): SyncRecord<Goal> => ({
  id,
  name,
  why: '',
  targetType: 'daily',
  targetMinutes: 30,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt,
  deletedAt: null,
});

const E = (id: string, goalId: string, updatedAt: string, minutes = 20): SyncRecord<LogEntry> => ({
  id,
  goalId,
  date: '2026-10-05',
  minutes,
  note: '',
  source: 'manual',
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt,
  deletedAt: null,
});

const T0 = '2026-10-09T03:00:00.000Z';
const T1 = '2026-10-09T03:01:00.000Z';
const T2 = '2026-10-09T03:02:00.000Z';

const prefs = (p: Partial<RemotePrefs>): RemotePrefs => ({ reminder: null, locale: null, ...p });

export function describeRemoteStoreContract(name: string, setup: () => Promise<ContractHarness>): void {
  describe(`RemoteStore contract — ${name}`, () => {
    it('push 3 goals → pull(null) returns the 3 rows with server stamps, hasMore false', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T0), G('g2', T0), G('g3', T0)], entries: [] });
      const page = await u1.pull('goals', null, 500);
      expect(page.rows.map((r) => r.id).sort()).toEqual(['g1', 'g2', 'g3']);
      expect(page.rows.map((r) => r.deletedAt)).toEqual([null, null, null]);
      for (const r of page.rows) expect(page.serverUpdatedAt[r.id]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(page.hasMore).toBe(false);
      expect(page.next).toEqual({ serverUpdatedAt: page.serverUpdatedAt[page.rows[page.rows.length - 1].id], id: page.rows[page.rows.length - 1].id });
      expect(page.skippedInvalid).toBe(0);
    });

    it('an older push loses: fetchByIds returns the newer server row; an equal push keeps the server row (tie → server)', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T1, 'Newer')], entries: [] });
      await u1.push({ goals: [G('g1', T0, 'Older')], entries: [] });
      let fetched = await u1.fetchByIds({ goals: ['g1'], entries: [] });
      expect(fetched.goals).toHaveLength(1);
      expect(fetched.goals[0]).toMatchObject({ id: 'g1', name: 'Newer', updatedAt: T1 });
      expect(fetched.serverUpdatedAt.g1).toBeTruthy();
      const stampBefore = fetched.serverUpdatedAt.g1;

      await u1.push({ goals: [G('g1', T1, 'Same stamp, other name')], entries: [] });
      fetched = await u1.fetchByIds({ goals: ['g1'], entries: [] });
      expect(fetched.goals[0].name).toBe('Newer');
      expect(fetched.serverUpdatedAt.g1).toBe(stampBefore);

      await u1.push({ goals: [G('g1', T2, 'Newest')], entries: [] });
      fetched = await u1.fetchByIds({ goals: ['g1'], entries: [] });
      expect(fetched.goals[0].name).toBe('Newest');
      expect(Date.parse(fetched.serverUpdatedAt.g1)).toBeGreaterThan(Date.parse(stampBefore));
      // Unknown ids are simply absent.
      const none = await u1.fetchByIds({ goals: ['nope'], entries: ['nope'] });
      expect(none.goals).toEqual([]);
      expect(none.entries).toEqual([]);
    });

    it('a tombstone is a write like any other: pushing deletedAt newer wins, older loses', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T0)], entries: [E('e1', 'g1', T0)] });
      await u1.push({ goals: [{ ...G('g1', T1), deletedAt: T1 }], entries: [{ ...E('e1', 'g1', T1), deletedAt: T1 }] });
      const fetched = await u1.fetchByIds({ goals: ['g1'], entries: ['e1'] });
      expect(fetched.goals[0].deletedAt).toBe(T1);
      expect(fetched.entries[0].deletedAt).toBe(T1);
      await u1.push({ goals: [G('g1', T0)], entries: [] });
      expect((await u1.fetchByIds({ goals: ['g1'], entries: [] })).goals[0].deletedAt).toBe(T1);
    });

    it('1 200 entries with limit 500 → pages of 500/500/200, all ids once, last hasMore false', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T0)], entries: [] });
      const entries = Array.from({ length: 1200 }, (_, i) => E(`e${String(i).padStart(4, '0')}`, 'g1', T0));
      await u1.push({ goals: [], entries });
      const seen = new Set<string>();
      let cursor = null as Awaited<ReturnType<typeof u1.pull>>['next'];
      const sizes: number[] = [];
      let hasMore = true;
      while (hasMore) {
        const page = await u1.pull('entries', cursor, 500);
        sizes.push(page.rows.length);
        for (const r of page.rows) {
          expect(seen.has(r.id)).toBe(false);
          seen.add(r.id);
        }
        cursor = page.next;
        hasMore = page.hasMore;
      }
      expect(sizes).toEqual([500, 500, 200]);
      expect(seen.size).toBe(1200);
    });

    it('pulling again from the stored cursor (rewound by the 120 s window) returns only rows inside the window or newer', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T0), G('g2', T0)], entries: [] });
      const first = await u1.pull('goals', null, 500);
      expect(first.rows).toHaveLength(2);
      const stored = first.next!;
      // Nothing new: the rewound cursor re-reads the rows inside the window (idempotent), nothing else.
      const again = await u1.pull('goals', rewindCursor(stored), 500);
      expect(again.rows.map((r) => r.id).sort()).toEqual(['g1', 'g2']);
      // A row older than the window must not come back: seed one 10 minutes before the cursor.
      if (h.seedRaw) {
        const old = new Date(Date.parse(stored.serverUpdatedAt) - 600_000).toISOString();
        await h.seedRaw('u1', 'goals', [{ ...goalRaw('g0', T0), server_updated_at: old }]);
        const afterSeed = await u1.pull('goals', rewindCursor(stored), 500);
        expect(afterSeed.rows.map((r) => r.id)).not.toContain('g0');
      }
      // A newer write comes back exactly once, after the cursor.
      await u1.push({ goals: [G('g3', T1)], entries: [] });
      const exact = await u1.pull('goals', stored, 500);
      expect(exact.rows.map((r) => r.id)).toEqual(['g3']);
      expect(exact.hasMore).toBe(false);
    });

    it('RLS: u2 pulls nothing of u1 and cannot read u1 ids; its own rows are separate', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      const u2 = h.as('u2');
      await u1.push({ goals: [G('g1', T0)], entries: [E('e1', 'g1', T0)] });
      expect((await u2.pull('goals', null, 500)).rows).toEqual([]);
      expect((await u2.pull('entries', null, 500)).rows).toEqual([]);
      expect((await u2.fetchByIds({ goals: ['g1'], entries: ['e1'] })).goals).toEqual([]);
      await u2.push({ goals: [G('g1', T1, 'Mine')], entries: [] });
      expect((await u1.fetchByIds({ goals: ['g1'], entries: [] })).goals[0].name).toBe('Goal g1');
      expect((await u2.fetchByIds({ goals: ['g1'], entries: [] })).goals[0].name).toBe('Mine');
    });

    it('(M7-D1) push: a row the cloud schema refuses (id > 64 chars) is reported in `rejected`, the other rows still land', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      const long = 'x'.repeat(65);
      const r = await u1.push({ goals: [G('g1', T0), G(long, T0), G('g3', T0)], entries: [E('e1', 'g1', T0), { ...E('e2', 'g1', T0), goalId: long }, { ...E(long, 'g1', T0) }] });
      expect(r.rejected).toEqual({ goals: [long], entries: ['e2', long] });
      expect((await u1.pull('goals', null, 500)).rows.map((x) => x.id).sort()).toEqual(['g1', 'g3']);
      expect((await u1.pull('entries', null, 500)).rows.map((x) => x.id)).toEqual(['e1']);
      expect(await u1.push({ goals: [G('g4', T0)], entries: [] })).toEqual({ rejected: { goals: [], entries: [] } });
    });

    it('(v4.0, M11-AC6) an open-ended daily goal round-trips with endDate null; a total goal without an end date is rejected before it is sent', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      const open: SyncRecord<Goal> = { ...G('o1', T0, 'Meditate'), targetMinutes: 10, endDate: null };
      const totalOpen: SyncRecord<Goal> = { ...G('bad-total', T0), targetType: 'total', targetMinutes: 6000, endDate: null };
      const r = await u1.push({ goals: [open, totalOpen, G('g2', T0)], entries: [E('e1', 'o1', T0)] });
      expect(r.rejected).toEqual({ goals: ['bad-total'], entries: [] });
      const fetched = await u1.fetchByIds({ goals: ['o1', 'bad-total', 'g2'], entries: ['e1'] });
      expect(fetched.goals.map((g) => g.id).sort()).toEqual(['g2', 'o1']);
      const o1 = fetched.goals.find((g) => g.id === 'o1')!;
      expect(o1.endDate).toBeNull();
      expect('endDate' in o1).toBe(true);
      expect(o1).toMatchObject({ targetType: 'daily', targetMinutes: 10, startDate: '2026-10-01', deletedAt: null });
      expect(fetched.skippedInvalid).toBe(0);
      const page = await u1.pull('goals', null, 500);
      expect(page.rows.find((g) => g.id === 'o1')?.endDate).toBeNull();
      expect(page.skippedInvalid).toBe(0);
      // Finite → open-ended and back is an ordinary LWW edit.
      await u1.push({ goals: [{ ...G('g2', T1), endDate: null }], entries: [] });
      expect((await u1.fetchByIds({ goals: ['g2'], entries: [] })).goals[0].endDate).toBeNull();
      await u1.push({ goals: [{ ...G('g2', T2), endDate: '2026-12-31' }], entries: [] });
      expect((await u1.fetchByIds({ goals: ['g2'], entries: [] })).goals[0].endDate).toBe('2026-12-31');
    });

    it('invalid rows on the server are skipped and counted; valid ones still come back', async ({ skip }) => {
      const h = await setup();
      const seedRaw = h.seedRaw;
      if (!seedRaw) {
        skip('raw seeding is impossible on real Postgres (check constraints); tests/db/remote-store.test.ts covers the rejection');
        return;
      }
      await h.reset();
      const u1 = h.as('u1');
      await u1.push({ goals: [G('g1', T0)], entries: [E('e-ok', 'g1', T0)] });
      await seedRaw('u1', 'entries', [
        { ...entryRaw('e-zero', 'g1', T0), minutes: 0 },
        { ...entryRaw('e-note', 'g1', T0), note: 'x'.repeat(281) },
        { ...entryRaw('e-src', 'g1', T0), source: 'x' },
      ]);
      const page = await u1.pull('entries', null, 500);
      expect(page.rows.map((r) => r.id)).toEqual(['e-ok']);
      expect(page.skippedInvalid).toBe(3);
      const fetched = await u1.fetchByIds({ goals: [], entries: ['e-ok', 'e-zero', 'e-note', 'e-src'] });
      expect(fetched.entries.map((r) => r.id)).toEqual(['e-ok']);
      expect(fetched.skippedInvalid).toBe(3);
    });

    it('(v2.1) prefs: null when absent; groups are independent; older/equal group loses; u2 isolated; invalid group reads as null', async () => {
      const h = await setup();
      await h.reset();
      const u1 = h.as('u1');
      const u2 = h.as('u2');
      expect(await u1.pullPrefs()).toEqual({ prefs: null, skippedInvalid: 0 });

      const r1 = await u1.pushPrefs(prefs({ reminder: { enabled: true, time: '07:30', updatedAt: T1 } }));
      expect(r1).toEqual({ reminder: { enabled: true, time: '07:30', updatedAt: T1 }, locale: null });
      expect((await u1.pullPrefs()).prefs).toEqual(r1);

      const r2 = await u1.pushPrefs(prefs({ locale: { value: 'vi', updatedAt: T0 } }));
      expect(r2).toEqual({ reminder: { enabled: true, time: '07:30', updatedAt: T1 }, locale: { value: 'vi', updatedAt: T0 } });

      const r3 = await u1.pushPrefs(prefs({ reminder: { enabled: false, time: '21:00', updatedAt: T0 } }));
      expect(r3.reminder).toEqual({ enabled: true, time: '07:30', updatedAt: T1 });
      const r4 = await u1.pushPrefs(prefs({ reminder: { enabled: false, time: '21:00', updatedAt: T1 } }));
      expect(r4.reminder).toEqual({ enabled: true, time: '07:30', updatedAt: T1 });
      const r5 = await u1.pushPrefs(prefs({ reminder: { enabled: false, time: '21:00', updatedAt: T2 } }));
      expect(r5).toEqual({ reminder: { enabled: false, time: '21:00', updatedAt: T2 }, locale: { value: 'vi', updatedAt: T0 } });

      expect((await u2.pullPrefs()).prefs).toBeNull();
      await u2.pushPrefs(prefs({ locale: { value: 'en', updatedAt: T2 } }));
      expect((await u1.pullPrefs()).prefs?.locale).toEqual({ value: 'vi', updatedAt: T0 });

      if (h.seedRaw) {
        await h.seedRaw('u2', 'settings', [{ reminder_enabled: true, reminder_time: '25:00', reminder_updated_at: T1, locale: 'fr', locale_updated_at: T1 }]);
        const bad = await u2.pullPrefs();
        expect(bad.prefs).toEqual({ reminder: null, locale: null });
        expect(bad.skippedInvalid).toBe(2);
      }
    });
  });
}

/** Raw cloud row helpers for `seedRaw`. */
export function goalRaw(id: string, updatedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `Goal ${id}`,
    why: '',
    target_type: 'daily',
    target_minutes: 30,
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    archived: false,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: updatedAt,
    deleted_at: null,
    ...extra,
  };
}

export function entryRaw(id: string, goalId: string, updatedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    goal_id: goalId,
    date: '2026-10-05',
    minutes: 20,
    note: '',
    source: 'manual',
    created_at: '2026-10-05T00:00:00.000Z',
    updated_at: updatedAt,
    deleted_at: null,
    ...extra,
  };
}
