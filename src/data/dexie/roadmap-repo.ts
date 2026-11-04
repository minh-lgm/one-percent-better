// Roadmap tables on Dexie v3 (phase 8, M17; ARCHITECTURE §4.8 b; ADR-48). Lazy-only module (ADR-53): created inside
// the `loadRoadmapService()` factory of the container, never imported statically from the cold-load path.
import type { Table } from 'dexie';
import { nextUpdatedAt } from '../../domain/sync';
import type { Roadmap, RoadmapAggregate, RoadmapCheckpoint, RoadmapItem, RoadmapPhase } from '../../domain/roadmap';
import type { Goal, LogEntry } from '../../domain/types';
import {
  isLive,
  toDomain,
  type RoadmapCheckpointRow,
  type RoadmapDetailData,
  type RoadmapItemRow,
  type RoadmapListData,
  type RoadmapPhaseRow,
  type RoadmapRepository,
  type RoadmapRow,
  type RoadmapRowsInput,
  type Subscribable,
} from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

type AnyRow = { id: string; updatedAt: string; deletedAt: string | null; dirty: 0 | 1 | 2 };

export interface RoadmapRepositoryOptions {
  clock?: () => Date;
  /** Test seam (NFR-27): runs inside every cascading delete transaction after the writes; throw to prove the rollback. */
  deleteProbe?: () => void;
}

export class DexieRoadmapRepository implements RoadmapRepository {
  private readonly clock: () => Date;
  private readonly deleteProbe?: () => void;

  constructor(
    private readonly db: AppDatabase,
    options: RoadmapRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.deleteProbe = options.deleteProbe;
  }

  private get tables() {
    return [this.db.roadmaps, this.db.roadmapPhases, this.db.roadmapItems, this.db.roadmapCheckpoints] as const;
  }

  /** Live children of a live roadmap; items of a tombstoned phase are left out. */
  private async children(roadmapId: string): Promise<Omit<RoadmapAggregate, 'roadmap'>> {
    const phases = (await this.db.roadmapPhases.where('roadmapId').equals(roadmapId).toArray()).filter(isLive);
    const phaseIds = new Set(phases.map((p) => p.id));
    const items = (await this.db.roadmapItems.where('roadmapId').equals(roadmapId).toArray()).filter((i) => isLive(i) && phaseIds.has(i.phaseId));
    const checkpoints = (await this.db.roadmapCheckpoints.where('roadmapId').equals(roadmapId).toArray()).filter(isLive);
    return { phases: phases.map(toDomain), items: items.map(toDomain), checkpoints: checkpoints.map(toDomain) };
  }

  async listLive(): Promise<Roadmap[]> {
    return (await this.db.roadmaps.filter(isLive).toArray()).map(toDomain);
  }

  getAggregate(roadmapId: string): Promise<RoadmapAggregate | null> {
    return this.db.transaction('r', [...this.tables], async () => {
      const row = await this.db.roadmaps.get(roadmapId);
      if (!isLive(row)) return null;
      return { roadmap: toDomain(row!), ...(await this.children(roadmapId)) };
    });
  }

  async findByGoal(goalId: string): Promise<Roadmap[]> {
    return (await this.db.roadmaps.where('goalId').equals(goalId).toArray()).filter(isLive).map(toDomain);
  }

  private async liveRow<T extends AnyRow>(table: Table<T, string, unknown>, id: string): Promise<Omit<T, 'dirty' | 'deletedAt'> | undefined> {
    const row = await table.get(id);
    return isLive(row) ? toDomain(row!) : undefined;
  }

  getPhase(id: string): Promise<RoadmapPhase | undefined> {
    return this.liveRow(this.db.roadmapPhases, id);
  }

  getItem(id: string): Promise<RoadmapItem | undefined> {
    return this.liveRow(this.db.roadmapItems, id);
  }

  getCheckpoint(id: string): Promise<RoadmapCheckpoint | undefined> {
    return this.liveRow(this.db.roadmapCheckpoints, id);
  }

  private async linkedGoalData(goalIds: Set<string>): Promise<{ goals: Goal[]; entries: LogEntry[] }> {
    if (goalIds.size === 0) return { goals: [], entries: [] };
    const goals = (await this.db.goals.where('id').anyOf([...goalIds]).toArray()).filter(isLive);
    const live = new Set(goals.map((g) => g.id));
    const entries = live.size === 0 ? [] : (await this.db.entries.where('goalId').anyOf([...live]).toArray()).filter(isLive);
    return { goals: goals.map(toDomain), entries: entries.map(toDomain) };
  }

  watchList(): Subscribable<RoadmapListData> {
    return fromLiveQuery(() =>
      this.db.transaction('r', [...this.tables, this.db.goals, this.db.entries], async () => {
        const roadmaps = await this.listLive();
        const data: RoadmapListData = { roadmaps, roadmapPhases: [], roadmapItems: [], roadmapCheckpoints: [], goals: [], entries: [] };
        for (const r of roadmaps) {
          const c = await this.children(r.id);
          data.roadmapPhases.push(...c.phases);
          data.roadmapItems.push(...c.items);
          data.roadmapCheckpoints.push(...c.checkpoints);
        }
        const linked = new Set(roadmaps.flatMap((r) => (r.goalId === null ? [] : [r.goalId])));
        Object.assign(data, await this.linkedGoalData(linked));
        return data;
      }),
    );
  }

  watchDetail(roadmapId: string): Subscribable<RoadmapDetailData | null> {
    return fromLiveQuery(() =>
      this.db.transaction('r', [...this.tables, this.db.goals, this.db.entries], async () => {
        const aggregate = await this.getAggregate(roadmapId);
        if (!aggregate) return null;
        const goalId = aggregate.roadmap.goalId;
        const { goals, entries } = await this.linkedGoalData(new Set(goalId === null ? [] : [goalId]));
        return { ...aggregate, goal: goals[0] ?? null, entries };
      }),
    );
  }

  async putRoadmap(r: Roadmap): Promise<void> {
    await this.db.roadmaps.put({ ...r, deletedAt: null, dirty: 1 });
  }

  async putPhase(p: RoadmapPhase): Promise<void> {
    await this.db.roadmapPhases.put({ ...p, deletedAt: null, dirty: 1 });
  }

  async putItem(i: RoadmapItem): Promise<void> {
    await this.db.roadmapItems.put({ ...i, deletedAt: null, dirty: 1 });
  }

  async putCheckpoint(c: RoadmapCheckpoint): Promise<void> {
    await this.db.roadmapCheckpoints.put({ ...c, deletedAt: null, dirty: 1 });
  }

  putMany(rows: RoadmapRowsInput): Promise<void> {
    const live = <T>(xs: T[] | undefined) => (xs ?? []).map((x) => ({ ...x, deletedAt: null, dirty: 1 as const }));
    return this.db.transaction('rw', [...this.tables], async () => {
      await this.db.roadmaps.bulkPut(live(rows.roadmaps) as RoadmapRow[]);
      await this.db.roadmapPhases.bulkPut(live(rows.phases) as RoadmapPhaseRow[]);
      await this.db.roadmapItems.bulkPut(live(rows.items) as RoadmapItemRow[]);
      await this.db.roadmapCheckpoints.bulkPut(live(rows.checkpoints) as RoadmapCheckpointRow[]);
    });
  }

  /** One stamp newer than every row involved, applied as `updatedAt` and `deletedAt` (`dirty = 1`). */
  private tombstone<T extends AnyRow>(rows: T[], stamp: string): T[] {
    return rows.map((r) => ({ ...r, updatedAt: stamp, deletedAt: stamp, dirty: 1 as const }));
  }

  private stampFor(now: Date, rows: AnyRow[]): string {
    let latest: string | null = null;
    for (const r of rows) if (latest === null || Date.parse(r.updatedAt) > Date.parse(latest)) latest = r.updatedAt;
    return nextUpdatedAt(now, latest);
  }

  deleteRoadmap(id: string): Promise<void> {
    const now = this.clock();
    return this.db.transaction('rw', [...this.tables], async () => {
      const roadmap = await this.db.roadmaps.get(id);
      if (!isLive(roadmap)) return;
      const phases = (await this.db.roadmapPhases.where('roadmapId').equals(id).toArray()).filter(isLive);
      const items = (await this.db.roadmapItems.where('roadmapId').equals(id).toArray()).filter(isLive);
      const checkpoints = (await this.db.roadmapCheckpoints.where('roadmapId').equals(id).toArray()).filter(isLive);
      const stamp = this.stampFor(now, [roadmap!, ...phases, ...items, ...checkpoints]);
      await this.db.roadmaps.put(this.tombstone([roadmap!], stamp)[0]);
      await this.db.roadmapPhases.bulkPut(this.tombstone(phases, stamp));
      await this.db.roadmapItems.bulkPut(this.tombstone(items, stamp));
      await this.db.roadmapCheckpoints.bulkPut(this.tombstone(checkpoints, stamp));
      this.deleteProbe?.();
    });
  }

  deletePhase(id: string): Promise<void> {
    const now = this.clock();
    return this.db.transaction('rw', this.db.roadmapPhases, this.db.roadmapItems, async () => {
      const phase = await this.db.roadmapPhases.get(id);
      if (!isLive(phase)) return;
      const items = (await this.db.roadmapItems.where('roadmapId').equals(phase!.roadmapId).toArray()).filter((i) => isLive(i) && i.phaseId === id);
      const stamp = this.stampFor(now, [phase!, ...items]);
      await this.db.roadmapPhases.put(this.tombstone([phase!], stamp)[0]);
      await this.db.roadmapItems.bulkPut(this.tombstone(items, stamp));
      this.deleteProbe?.();
    });
  }

  private async softDelete<T extends AnyRow>(table: Table<T, string, unknown>, id: string): Promise<void> {
    const now = this.clock();
    const row = await table.get(id);
    if (!isLive(row)) return;
    await table.put(this.tombstone([row!], nextUpdatedAt(now, row!.updatedAt))[0] as never);
  }

  deleteItem(id: string): Promise<void> {
    return this.db.transaction('rw', this.db.roadmapItems, () => this.softDelete(this.db.roadmapItems, id));
  }

  deleteCheckpoint(id: string): Promise<void> {
    return this.db.transaction('rw', this.db.roadmapCheckpoints, () => this.softDelete(this.db.roadmapCheckpoints, id));
  }
}
