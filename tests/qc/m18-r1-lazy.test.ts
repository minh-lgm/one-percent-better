// QC M18 round 1 — LazySyncEngine: offline / failed chunk load must surface as a status error, never throw; observation
// calls must not trigger a load; a later call retries the load.
import { describe, expect, it, vi } from 'vitest';
import { LazySyncEngine } from '../../src/services/lazy-sync-engine';
import type { SyncService } from '../../src/services/sync-service';

describe('LazySyncEngine (independent)', () => {
  it('observation never loads; syncNow with a failing loader returns SYNC_UNREACHABLE and does not throw; retry loads again', async () => {
    const loader = vi.fn<() => Promise<SyncService>>().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const lazy = new LazySyncEngine(loader);
    expect(lazy.current()).toEqual({ kind: 'paused', pending: 0, lastSyncedAt: null });
    lazy.watchStatus().subscribe(() => undefined);
    lazy.watchMergePrompt().subscribe(() => undefined);
    lazy.onEvent(() => undefined);
    lazy.pause();
    expect(await lazy.countRejected()).toBe(0);
    expect(await lazy.finalSyncBeforeSignOut()).toEqual({ pending: 0 });
    await lazy.reset();
    expect(loader).not.toHaveBeenCalled();

    const seen: string[] = [];
    lazy.watchStatus().subscribe((s) => seen.push(s.kind));
    const r = await lazy.syncNow('manual');
    expect(r).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' });
    expect(lazy.current()).toMatchObject({ kind: 'error', error: 'SYNC_UNREACHABLE' });
    expect(seen).toContain('error');
    expect(loader).toHaveBeenCalledTimes(1);
    await lazy.syncNow('manual');
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(lazy.handleSignedIn('u', 'e@x.y')).resolves.toBe('same-user');
  });
});

// Failure mode probe: the engine chunk fails to load exactly while the sign-in is handled (stale hashed chunk after a
// deploy, flaky network right after the OAuth callback). `LazySyncEngine.handleSignedIn` answers 'same-user' and the
// merge decision (D5) is never taken; the next cycle that does load the engine must not upload another account's data.
import { createDevice, FakeRemoteServer, U1, U2 } from '../../src/test/two-devices';
import { datasetQ1 } from '../../src/test/builders';

describe('LazySyncEngine failed load during sign-in (independent)', () => {
  // M18-D1 is open: `it.fails` keeps the suite green and turns red ("expected to fail") as soon as the defect is fixed.
  it.fails('M18-D1: device holding account U1 data, U2 signs in, first load fails, a later cycle loads: U2 must not receive U1 data without the D5 prompt', async () => {
    const NOW = new Date('2026-11-04T03:00:00.000Z');
    const server = new FakeRemoteServer(() => NOW);
    const dev = await createDevice('P', server, { now: NOW, userId: U2, signedIn: false });
    try {
      const q = datasetQ1();
      await dev.db.goals.bulkPut(q.goals.map((g) => ({ ...g, deletedAt: null, dirty: 1 as const })));
      await dev.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null });
      let fail = true;
      const lazy = new LazySyncEngine(async () => {
        if (fail) throw new Error('chunk 404');
        return dev.sync;
      });
      const decision = await lazy.handleSignedIn(U2, 'u2@example.com');
      fail = false;
      await lazy.syncNow('visible');
      const uploaded = server.live('goals', U2).length;
      // Expected by FR-47/A-27: a different account on a device with data -> D5 'confirm-merge', nothing uploaded.
      expect({ decision, uploaded }).toEqual({ decision: 'confirm-merge', uploaded: 0 });
    } finally {
      await dev.dispose();
    }
  });
});
