// Two "devices" (two fake-indexeddb databases, two repository/service sets) sharing one
// `FakeRemoteServer` (ARCHITECTURE §8 "Hai thiết bị", M7-AC6, M7-AC17).
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { AppDatabase, openDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieLocalDataRepository } from '../data/dexie/local-data-repo';
import { DexieSyncedPrefsRepository } from '../data/dexie/prefs-repo';
import { DexieSyncStore } from '../data/dexie/sync-store';
import { BackupService } from '../services/backup-service';
import { EntryService } from '../services/entry-service';
import { GoalService } from '../services/goal-service';
import { LocaleService } from '../services/locale-service';
import { MemoryLockPort, noLocks, type LockPort } from '../services/lock-port';
import { SettingsService } from '../services/settings-service';
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
  remote: FakeRemoteStore;
  sync: SyncService;
  /** Device clock (settable: simulate a slow clock). */
  clock: { now: Date };
  online: { value: boolean };
  user: { id: string | null };
  /** Live goals/entries as domain objects (what the UI would show). */
  snapshot(): Promise<{ goals: Record<string, unknown>[]; entries: Record<string, unknown>[] }>;
  dispose(): Promise<void>;
}

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
  const store = new DexieSyncStore(db);
  const localData = new DexieLocalDataRepository(db);
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
    remote,
    sync,
    clock,
    online,
    user,
    async snapshot() {
      const g = (await goals.getAll()).sort((a, b) => a.id.localeCompare(b.id));
      const range = g.length ? [g.reduce((m, x) => (x.startDate < m ? x.startDate : m), g[0].startDate), g.reduce((m, x) => (x.endDate > m ? x.endDate : m), g[0].endDate)] : null;
      const e = range ? (await entries.getByDateRange(range[0], range[1])).sort((a, b) => a.id.localeCompare(b.id)) : [];
      return { goals: g as unknown as Record<string, unknown>[], entries: e as unknown as Record<string, unknown>[] };
    },
    async dispose() {
      sync.stop();
      await db.delete();
    },
  };
  return device;
}

/** What the server holds as live rows, in domain shape, sorted by id (for convergence checks). */
export function serverSnapshot(server: FakeRemoteServer, userId: string): { goals: Record<string, unknown>[]; entries: Record<string, unknown>[] } {
  const g = server.live('goals', userId).map((r) => ({
    id: r.id,
    name: r.name,
    why: r.why,
    targetType: r.target_type,
    targetMinutes: r.target_minutes,
    startDate: r.start_date,
    endDate: r.end_date,
    archived: r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  const liveGoalIds = new Set(g.map((x) => x.id as string));
  const e = server
    .live('entries', userId)
    .filter((r) => liveGoalIds.has(r.goal_id as string))
    .map((r) => ({ id: r.id, goalId: r.goal_id, date: r.date, minutes: r.minutes, note: r.note, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at }));
  g.sort((a, b) => (a.id as string).localeCompare(b.id as string));
  e.sort((a, b) => (a.id as string).localeCompare(b.id as string));
  return { goals: g, entries: e };
}

export { FakeRemoteServer, FakeRemoteStore, MemoryLockPort };
