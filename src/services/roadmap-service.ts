// RoadmapService (phase 8, M17; ARCHITECTURE §4.8 b, i; FR-69 … FR-72, FR-75; A-78, A-81, A-83; ADR-51).
// Lazy-only module (ADR-53): the container exposes it through `loadRoadmapService()` (`import()`), so nothing
// here is on the cold-load path. Every failure is a `Result`; only storage failures throw.
import type { GoalRepository, RoadmapRepository, Subscribable } from '../data/repositories';
import { addDays } from '../domain/dates';
import {
  checkLimit,
  checkRoadmapSpan,
  needsRenumber,
  positionBetween,
  sortItems,
  sortPhases,
  validateCheckpointInput,
  validateItemInput,
  validatePhaseInput,
  validateRoadmapInput,
  type CheckpointInput,
  type ItemInput,
  type PhaseInput,
  type Roadmap,
  type RoadmapAggregate,
  type RoadmapCheckpoint,
  type RoadmapEntityKind,
  type RoadmapInput,
  type RoadmapItem,
  type RoadmapPhase,
} from '../domain/roadmap';
import { roadmapView, toListRow, type RoadmapListRow, type RoadmapView } from '../domain/roadmap-progress';
import { nextUpdatedAt } from '../domain/sync';
import { fail, ok, type DomainError, type ISODate, type Result } from '../domain/types';
import { randomUuid } from '../domain/uuid';

export interface RoadmapServiceDeps {
  roadmaps: RoadmapRepository;
  goals: GoalRepository;
  newId?: () => string;
  clock?: () => Date;
}

const notFound = (kind: RoadmapEntityKind, id: string): DomainError => ({ code: 'ROADMAP_NOT_FOUND', message: `${kind} ${id} not found`, params: { kind } });

function mapSubscribable<A, B>(source: Subscribable<A>, fn: (a: A) => B): Subscribable<B> {
  return { subscribe: (next, error) => source.subscribe((a) => next(fn(a)), error) };
}

export class RoadmapService {
  private readonly roadmaps: RoadmapRepository;
  private readonly goals: GoalRepository;
  private readonly newId: () => string;
  private readonly clock: () => Date;

  constructor(deps: RoadmapServiceDeps) {
    this.roadmaps = deps.roadmaps;
    this.goals = deps.goals;
    this.newId = deps.newId ?? (() => randomUuid());
    this.clock = deps.clock ?? (() => new Date());
  }

  private stamp(previous?: string): string {
    return nextUpdatedAt(this.clock(), previous ?? null);
  }

  // ---- goal link (A-78, ARCHITECTURE §4.8 i) ----

  /** `null` when `goalId` may be linked to `roadmapId`; otherwise the error. */
  private async checkGoalLink(roadmapId: string | null, goalId: string | null): Promise<DomainError | null> {
    if (goalId === null) return null;
    if (!(await this.goals.getById(goalId))) return { code: 'GOAL_NOT_FOUND', field: 'goalId', message: `goal ${goalId} not found` };
    const other = (await this.roadmaps.findByGoal(goalId)).find((r) => r.id !== roadmapId);
    if (other) return { code: 'ROADMAP_GOAL_ALREADY_LINKED', field: 'goalId', message: `goal ${goalId} is linked to roadmap ${other.id}`, params: { title: other.title } };
    return null;
  }

  // ---- roadmap ----

  async create(input: RoadmapInput): Promise<Result<Roadmap>> {
    const limit = checkLimit('roadmap', (await this.roadmaps.listLive()).length);
    if (limit) return fail(limit);
    const validated = validateRoadmapInput(input);
    if (!validated.ok) return validated;
    const link = await this.checkGoalLink(null, validated.value.goalId);
    if (link) return fail(link);
    const stamp = this.stamp();
    const roadmap: Roadmap = { id: this.newId(), ...validated.value, createdAt: stamp, updatedAt: stamp };
    await this.roadmaps.putRoadmap(roadmap);
    return ok(roadmap);
  }

  async update(id: string, input: RoadmapInput): Promise<Result<Roadmap>> {
    const existing = await this.roadmaps.getAggregate(id);
    if (!existing) return fail(notFound('roadmap', id));
    const validated = validateRoadmapInput(input);
    if (!validated.ok) return validated;
    if (validated.value.goalId !== existing.roadmap.goalId) {
      const link = await this.checkGoalLink(id, validated.value.goalId);
      if (link) return fail(link);
    }
    const roadmap: Roadmap = { ...existing.roadmap, ...validated.value, updatedAt: this.stamp(existing.roadmap.updatedAt) };
    await this.roadmaps.putRoadmap(roadmap);
    return ok(roadmap);
  }

  /** Link / unlink without touching the other fields (editor picker, "Link a goal" entry points). */
  async setGoalLink(id: string, goalId: string | null): Promise<Result<Roadmap>> {
    const existing = await this.roadmaps.getAggregate(id);
    if (!existing) return fail(notFound('roadmap', id));
    if (goalId === existing.roadmap.goalId) return ok(existing.roadmap);
    const link = await this.checkGoalLink(id, goalId);
    if (link) return fail(link);
    const roadmap: Roadmap = { ...existing.roadmap, goalId, updatedAt: this.stamp(existing.roadmap.updatedAt) };
    await this.roadmaps.putRoadmap(roadmap);
    return ok(roadmap);
  }

  async remove(id: string): Promise<Result<void>> {
    if (!(await this.roadmaps.getAggregate(id))) return fail(notFound('roadmap', id));
    await this.roadmaps.deleteRoadmap(id);
    return ok(undefined);
  }

  // ---- phases ----

  async addPhase(roadmapId: string, input: PhaseInput): Promise<Result<RoadmapPhase>> {
    const agg = await this.roadmaps.getAggregate(roadmapId);
    if (!agg) return fail(notFound('roadmap', roadmapId));
    const limit = checkLimit('phase', agg.phases.length);
    if (limit) return fail(limit);
    const validated = validatePhaseInput(input);
    if (!validated.ok) return validated;
    const sorted = sortPhases(agg.phases);
    const stamp = this.stamp();
    const phase: RoadmapPhase = { id: this.newId(), roadmapId, ...validated.value, position: positionBetween(sorted.at(-1)?.position ?? null, null), createdAt: stamp, updatedAt: stamp };
    await this.roadmaps.putPhase(phase);
    return ok(phase);
  }

  async updatePhase(id: string, input: PhaseInput): Promise<Result<RoadmapPhase>> {
    const existing = await this.roadmaps.getPhase(id);
    if (!existing) return fail(notFound('phase', id));
    const validated = validatePhaseInput(input);
    if (!validated.ok) return validated;
    const phase: RoadmapPhase = { ...existing, ...validated.value, updatedAt: this.stamp(existing.updatedAt) };
    await this.roadmaps.putPhase(phase);
    return ok(phase);
  }

  async removePhase(id: string): Promise<Result<void>> {
    if (!(await this.roadmaps.getPhase(id))) return fail(notFound('phase', id));
    await this.roadmaps.deletePhase(id);
    return ok(undefined);
  }

  /** Place `id` right before `beforeId` (`null` = last). Writes only the moved row unless the gap is exhausted (ADR-51). */
  async movePhase(id: string, beforeId: string | null): Promise<Result<RoadmapPhase>> {
    const moving = await this.roadmaps.getPhase(id);
    if (!moving) return fail(notFound('phase', id));
    const agg = (await this.roadmaps.getAggregate(moving.roadmapId))!;
    const others = sortPhases(agg.phases).filter((p) => p.id !== id);
    const placed = this.place(others, moving, beforeId);
    if (!placed.ok) return placed;
    const { moved, renumbered } = placed.value;
    if (renumbered) await this.roadmaps.putMany({ phases: renumbered });
    else await this.roadmaps.putPhase(moved);
    return ok(moved);
  }

  /**
   * Insert `moving` into `others` (sorted, without it) before `beforeId`. Returns the moved row with its new position,
   * plus the whole renumbered list when neighbours got closer than 1e-6 (every row re-stamped, written as one batch).
   */
  private place<T extends { id: string; position: number; updatedAt: string }>(others: T[], moving: T, beforeId: string | null): Result<{ moved: T; renumbered: T[] | null }> {
    const index = beforeId === null ? others.length : others.findIndex((p) => p.id === beforeId);
    if (index === -1) return fail(notFound('item', beforeId!));
    const prev = others[index - 1]?.position ?? null;
    const next = others[index]?.position ?? null;
    const moved: T = { ...moving, position: positionBetween(prev, next), updatedAt: this.stamp(moving.updatedAt) };
    const list = [...others.slice(0, index), moved, ...others.slice(index)];
    if (!needsRenumber(list.map((p) => p.position))) return ok({ moved, renumbered: null });
    const renumbered = list.map((p, i) => ({ ...p, position: i, updatedAt: this.stamp(p.updatedAt) }));
    return ok({ moved: renumbered[index], renumbered });
  }

  // ---- items ----

  /** Default planned range of a new item (A-83): the 7 days right after the last item (empty roadmap: today → +6). */
  async suggestedItemDates(roadmapId: string, today: ISODate): Promise<{ plannedStart: ISODate; plannedEnd: ISODate }> {
    const agg = await this.roadmaps.getAggregate(roadmapId);
    const last = agg ? sortItems(agg.items, agg.phases).at(-1) : undefined;
    const plannedStart = last ? addDays(last.plannedEnd, 1) : today;
    return { plannedStart, plannedEnd: addDays(plannedStart, 6) };
  }

  async addItem(phaseId: string, input: ItemInput, today: ISODate): Promise<Result<RoadmapItem>> {
    const phase = await this.roadmaps.getPhase(phaseId);
    if (!phase) return fail(notFound('phase', phaseId));
    const agg = (await this.roadmaps.getAggregate(phase.roadmapId))!;
    const limit = checkLimit('item', agg.items.length);
    if (limit) return fail(limit);
    const validated = validateItemInput(input, today);
    if (!validated.ok) return validated;
    const span = checkRoadmapSpan([...agg.items, validated.value]);
    if (span) return fail(span);
    const siblings = sortItems(agg.items, agg.phases).filter((i) => i.phaseId === phaseId);
    const stamp = this.stamp();
    const item: RoadmapItem = { id: this.newId(), roadmapId: phase.roadmapId, phaseId, ...validated.value, position: positionBetween(siblings.at(-1)?.position ?? null, null), createdAt: stamp, updatedAt: stamp };
    await this.roadmaps.putItem(item);
    return ok(item);
  }

  async updateItem(id: string, input: ItemInput, today: ISODate): Promise<Result<RoadmapItem>> {
    const existing = await this.roadmaps.getItem(id);
    if (!existing) return fail(notFound('item', id));
    const validated = validateItemInput(input, today);
    if (!validated.ok) return validated;
    const agg = (await this.roadmaps.getAggregate(existing.roadmapId))!;
    const span = checkRoadmapSpan([...agg.items.filter((i) => i.id !== id), validated.value]);
    if (span) return fail(span);
    const item: RoadmapItem = { ...existing, ...validated.value, updatedAt: this.stamp(existing.updatedAt) };
    await this.roadmaps.putItem(item);
    return ok(item);
  }

  async removeItem(id: string): Promise<Result<void>> {
    if (!(await this.roadmaps.getItem(id))) return fail(notFound('item', id));
    await this.roadmaps.deleteItem(id);
    return ok(undefined);
  }

  /** Move `id` into `targetPhaseId` right before `beforeId` (`null` = last of that phase). */
  async moveItem(id: string, targetPhaseId: string, beforeId: string | null): Promise<Result<RoadmapItem>> {
    const moving = await this.roadmaps.getItem(id);
    if (!moving) return fail(notFound('item', id));
    const target = await this.roadmaps.getPhase(targetPhaseId);
    if (!target || target.roadmapId !== moving.roadmapId) return fail(notFound('phase', targetPhaseId));
    const agg = (await this.roadmaps.getAggregate(moving.roadmapId))!;
    const siblings = sortItems(agg.items, agg.phases).filter((i) => i.phaseId === targetPhaseId && i.id !== id);
    const placed = this.place(siblings, { ...moving, phaseId: targetPhaseId }, beforeId);
    if (!placed.ok) return placed;
    const { moved, renumbered } = placed.value;
    if (renumbered) await this.roadmaps.putMany({ items: renumbered });
    else await this.roadmaps.putItem(moved);
    return ok(moved);
  }

  private async patchItem(id: string, patch: Partial<Pick<RoadmapItem, 'actualStart' | 'actualEnd'>>, today: ISODate): Promise<Result<RoadmapItem>> {
    const existing = await this.roadmaps.getItem(id);
    if (!existing) return fail(notFound('item', id));
    const next = { ...existing, ...patch };
    const validated = validateItemInput(next, today);
    if (!validated.ok) return validated;
    const item: RoadmapItem = { ...next, updatedAt: this.stamp(existing.updatedAt) };
    await this.roadmaps.putItem(item);
    return ok(item);
  }

  /** Done ⇔ `actualEnd` (A-81): ticking sets `actualEnd = actualEnd ?? today`, unticking clears it (start kept). */
  setItemDone(id: string, done: boolean, today: ISODate): Promise<Result<RoadmapItem>> {
    return this.roadmaps.getItem(id).then((existing) => {
      if (!existing) return fail<RoadmapItem>(notFound('item', id));
      return this.patchItem(id, { actualEnd: done ? (existing.actualEnd ?? today) : null }, today);
    });
  }

  setItemActual(id: string, which: 'start' | 'end', date: ISODate | null, today: ISODate): Promise<Result<RoadmapItem>> {
    return this.patchItem(id, which === 'start' ? { actualStart: date } : { actualEnd: date }, today);
  }

  // ---- checkpoints ----

  async addCheckpoint(roadmapId: string, input: CheckpointInput): Promise<Result<RoadmapCheckpoint>> {
    const agg = await this.roadmaps.getAggregate(roadmapId);
    if (!agg) return fail(notFound('roadmap', roadmapId));
    const limit = checkLimit('checkpoint', agg.checkpoints.length);
    if (limit) return fail(limit);
    const validated = validateCheckpointInput(input);
    if (!validated.ok) return validated;
    const stamp = this.stamp();
    const checkpoint: RoadmapCheckpoint = { id: this.newId(), roadmapId, ...validated.value, createdAt: stamp, updatedAt: stamp };
    await this.roadmaps.putCheckpoint(checkpoint);
    return ok(checkpoint);
  }

  async updateCheckpoint(id: string, input: CheckpointInput): Promise<Result<RoadmapCheckpoint>> {
    const existing = await this.roadmaps.getCheckpoint(id);
    if (!existing) return fail(notFound('checkpoint', id));
    const validated = validateCheckpointInput(input);
    if (!validated.ok) return validated;
    const checkpoint: RoadmapCheckpoint = { ...existing, ...validated.value, updatedAt: this.stamp(existing.updatedAt) };
    await this.roadmaps.putCheckpoint(checkpoint);
    return ok(checkpoint);
  }

  async removeCheckpoint(id: string): Promise<Result<void>> {
    if (!(await this.roadmaps.getCheckpoint(id))) return fail(notFound('checkpoint', id));
    await this.roadmaps.deleteCheckpoint(id);
    return ok(undefined);
  }

  // ---- reads ----

  getAggregate(id: string): Promise<RoadmapAggregate | null> {
    return this.roadmaps.getAggregate(id);
  }

  /** Roadmap + children + linked goal + its entries → derived values; re-emits on any change (entries included). */
  watchDetail(id: string, today: ISODate): Subscribable<RoadmapView | null> {
    return mapSubscribable(this.roadmaps.watchDetail(id), (data) => (data ? roadmapView(data, data.goal, data.entries, today) : null));
  }

  /** The list rows, oldest roadmap first (FR-68). */
  watchList(today: ISODate): Subscribable<RoadmapListRow[]> {
    return mapSubscribable(this.roadmaps.watchList(), (data) => {
      const goals = new Map(data.goals.map((g) => [g.id, g]));
      return [...data.roadmaps]
        .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
        .map((roadmap) => {
          const goal = roadmap.goalId === null ? null : goals.get(roadmap.goalId);
          const entries = goal ? data.entries.filter((e) => e.goalId === goal.id) : [];
          const aggregate: RoadmapAggregate = {
            roadmap,
            phases: data.roadmapPhases.filter((p) => p.roadmapId === roadmap.id),
            items: data.roadmapItems.filter((i) => i.roadmapId === roadmap.id),
            checkpoints: data.roadmapCheckpoints.filter((c) => c.roadmapId === roadmap.id),
          };
          return toListRow(roadmapView(aggregate, goal, entries, today));
        });
    });
  }
}
