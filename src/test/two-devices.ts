// Two "devices" (two fake-indexeddb databases, two repository/service sets) sharing one
// `FakeRemoteServer` (ARCHITECTURE §8 "Hai thiết bị", M7-AC6, M7-AC17; v8.0 M18-AC4: the roadmap tables too).
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { AppDatabase, openDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieLocalDataRepository } from '../data/dexie/local-data-repo';
import { DexieSyncedPrefsRepository } from '../data/dexie/prefs-repo';
import { DexieRoadmapRepository } from '../data/dexie/roadmap-repo';
import { DexieSyncStore } from '../data/dexie/sync-store';
import { SYNC_TABLES } from '../data/sync-tables';
import type { RoadmapAggregate } from '../domain/roadmap';
import { TABLE_CODECS } from '../integration/supabase/mapper';
import { BackupService } from '../services/backup-service';
import { EntryService } from '../services/entry-service';
import { GoalService } from '../services/goal-service';
import { LocaleService } from '../services/locale-service';
import { MemoryLockPort, noLocks, type LockPort } from '../services/lock-port';
import { RoadmapService } from '../services/roadmap-service';
import { SettingsService } from '../services/settings-service';
import { goalsDateRange } from '../services/stats-service';
import { SyncService, type SyncServiceDeps } from '../services/sync-service';
import { FakeRemoteServer, FakeRemoteStore } from './fake-remote-store';

let n = 0;

export interface Device {
  name: string;
  db: AppDatabase;
  goals: DexieGoalRepository;
  entries: DexieEntryRepository;
  kv: DexieKvRepository;
  prefs: DexieSyncedPrefsRepository;
  store: DexieSyncStore;
  localData: DexieLocalDataRepository;
  goalService: GoalService;
  entryService: EntryService;
  settingsService: SettingsService;
  localeService: LocaleService;
  backupService: BackupService;
  /** v8.0 (M18): the big-goals repository and service of this device. */
  roadmaps: DexieRoadmapRepository;
  roadmapService: RoadmapService;
  remote: FakeRemoteStore;
  sync: SyncService;
  /** Device clock (settable: simulate a slow clock). */
  clock: { now: Date };
  online: { value: boolean };
  user: { id: string | null };
  /** Live goals/entries as domain objects (what the UI would show), sorted by id (M7 shape, kept for the QC oracles). */
  snapshot(): Promise<{ goals: Record<string, unknown>[]; entries: Record<string, unknown>[] }>;
  /** v8.0: live rows of the six synced tables, sorted by id. */
  snapshotAll(): Promise<Snapshot>;
  /** v8.0: write a whole roadmap aggregate (template / dataset) as new dirty rows. */
  seedRoadmap(aggregate: RoadmapAggregate): Promise<void>;
  dispose(): Promise<void>;
}

/** Live rows per local table, sorted by id (convergence checks). */
export type Snapshot = Record<'goals' | 'entries' | 'roadmaps' | 'roadmapPhases' | 'roadmapItems' | 'roadmapCheckpoints', Record<string, unknown>[]>;

export interface DeviceOptions {
  userId?: string;
  now?: Date;
  locks?: LockPort;
  /** Share a database with another device (two tabs of one browser). */
  dbName?: string;
  batchSize?: number;
  timers?: SyncServiceDeps['timers'];
  signOutTimeoutMs?: number;
  /** Gate awaited before the first remote request of every cycle (deterministic race tests). */
  ready?: () => Promise<void>;
  /** Seed kv `sync` with `userId`/`lastUserId` as AuthService does at sign-in (M10: the purge rule reads it). Default: not seeded. */
  signedIn?: boolean;
}

export const U1 = '00000000-0000-4000-8000-000000000001';
export const U2 = '00000000-0000-4000-8000-000000000002';

export async function createDevice(name: string, server: FakeRemoteServer, options: DeviceOptions = {}): Promise<Device> {
  const db = new AppDatabase(options.dbName ?? `device-${name}-${Date.now()}-${++n}-${Math.random().toString(36).slice(2)}`);
  await openDatabase(db);
  const clock = { now: options.now ?? new Date('2026-10-09T03:00:00.000Z') };
  const tick = () => clock.now;
  const online = { value: true };
  const user = { id: options.userId ?? U1 };
  const goals = new DexieGoalRepository(db, tick);
  const entries = new DexieEntryRepository(db, tick);
  const kv = new DexieKvRepository(db);
  const prefs = new DexieSyncedPrefsRepository(db);
  const store = new DexieSyncStore(db, tick);
  const localData = new DexieLocalDataRepository(db);
  const roadmaps = new DexieRoadmapRepository(db, { clock: tick });
  if (options.signedIn) await kv.set('sync', { userId: user.id, lastUserId: user.id, account: null, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null });
  const remote = new FakeRemoteStore(server, user.id ?? U1);
  const settingsService = new SettingsService(kv, prefs, tick);
  const localeService = new LocaleService(kv, prefs, tick);
  const sync = new SyncService({
    local: store,
    prefs,
    localData,
    loadRemote: async () => remote,
    kv,
    auth: { currentUserId: () => user.id, ...(options.ready ? { ready: options.ready } : {}) },
    locks: options.locks ?? noLocks,
    clock: tick,
    connectivity: { isOnline: () => online.value },
    timers: options.timers ?? { setTimeout: () => 0, clearTimeout: () => undefined },
    batchSize: options.batchSize,
    signOutTimeoutMs: options.signOutTimeoutMs,
  });
  const device: Device = {
    name,
    db,
    goals,
    entries,
    kv,
    prefs,
    store,
    localData,
    goalService: new GoalService(goals, entries, undefined, kv),
    entryService: new EntryService(entries, goals),
    settingsService,
    localeService,
    backupService: new BackupService(new DexieBackupRepository(db, tick), settingsService, () => user.id !== null),
    roadmaps,
    roadmapService: new RoadmapService({ roadmaps, goals, clock: tick }),
    remote,
    sync,
    clock,
    online,
    user,
    async snapshot() {
      const all = await device.snapshotAll();
      return { goals: all.goals, entries: all.entries };
    },
    async snapshotAll() {
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id)) as unknown as Record<string, unknown>[];
      const g = (await goals.getAll()).sort((a, b) => a.id.localeCompare(b.id));
      const range = goalsDateRange(g);
      const e = range ? await entries.getByDateRange(range[0], range[1]) : [];
      // Roadmap tables: live rows whose parents are live (what `RoadmapRepository` reads), without the sync markers.
      const live = (r: { deletedAt?: string | null }) => r.deletedAt == null;
      const strip = <T extends { dirty?: unknown; deletedAt?: unknown }>(r: T) => {
        const { dirty: _d, deletedAt: _x, ...rest } = r;
        return rest;
      };
      const rm = (await db.roadmaps.toArray()).filter(live);
      const rmIds = new Set(rm.map((r) => r.id));
      const ph = (await db.roadmapPhases.toArray()).filter((p) => live(p) && rmIds.has(p.roadmapId));
      const phIds = new Set(ph.map((p) => p.id));
      const it = (await db.roadmapItems.toArray()).filter((i) => live(i) && rmIds.has(i.roadmapId) && phIds.has(i.phaseId));
      const cp = (await db.roadmapCheckpoints.toArray()).filter((c) => live(c) && rmIds.has(c.roadmapId));
      return { goals: byId(g), entries: byId(e), roadmaps: byId(rm.map(strip)), roadmapPhases: byId(ph.map(strip)), roadmapItems: byId(it.map(strip)), roadmapCheckpoints: byId(cp.map(strip)) };
    },
    async seedRoadmap(aggregate) {
      await roadmaps.putMany({ roadmaps: [aggregate.roadmap], phases: aggregate.phases, items: aggregate.items, checkpoints: aggregate.checkpoints });
    },
    async dispose() {
      sync.stop();
      await db.delete();
    },
  };
  return device;
}

/** What the server holds as live goals/entries, in domain shape, sorted by id (M7 shape, kept for the QC oracles). */
export function serverSnapshot(server: FakeRemoteServer, userId: string): { goals: Record<string, unknown>[]; entries: Record<string, unknown>[] } {
  const all = serverSnapshotAll(server, userId);
  return { goals: all.goals, entries: all.entries };
}

/**
 * v8.0: what the server holds as live rows of the six tables, in domain shape, sorted by id (for convergence checks).
 * Children of a tombstoned parent are left out, like a device's `snapshotAll()` (they are tombstoned there at the next cycle).
 */
export function serverSnapshotAll(server: FakeRemoteServer, userId: string): Snapshot {
  const out = {} as Snapshot;
  const liveIds = {} as Record<string, Set<string>>;
  for (const spec of SYNC_TABLES) {
    const mapped = TABLE_CODECS[spec.remote].mapRows(server.live(spec.remote, userId)).rows as Array<Record<string, unknown>>;
    const rows = mapped
      .filter((r) => spec.parents.every((p) => liveIds[p.table].has(r[p.field] as string)))
      .map(({ deletedAt: _d, ...rest }) => rest)
      .sort((a, b) => (a.id as string).localeCompare(b.id as string));
    liveIds[spec.local] = new Set(rows.map((r) => r.id as string));
    out[spec.local] = rows;
  }
  return out;
}

export { FakeRemoteServer, FakeRemoteStore, MemoryLockPort };
