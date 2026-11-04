// v8.0 (M19-T4, FR-80): which live roadmaps a goal belongs to, for Goal detail ("Part of roadmap …") and the delete-goal
// dialog (Goals, Goal detail). Reached only from those lazy screens; the roadmap service itself is loaded on demand
// through the container (ADR-53), so neither the cold load nor an unlinked goal pays for it.
import type { Roadmap } from '../domain/roadmap';

export interface RoadmapFinder {
  findByGoal(goalId: string): Promise<Roadmap[]>;
}

/** Live roadmaps linked to `goalId`, oldest first; `[]` when there are none or the lazy chunk cannot load (offline, uncached). */
export async function linkedRoadmaps(load: () => Promise<RoadmapFinder>, goalId: string): Promise<Roadmap[]> {
  try {
    return await (await load()).findByGoal(goalId);
  } catch {
    return [];
  }
}

/** Titles for the D2 paragraph (`goal.delete.roadmapNote`, joined with `, ` by the caller). */
export async function linkedRoadmapTitles(load: () => Promise<RoadmapFinder>, goalId: string): Promise<string[]> {
  return (await linkedRoadmaps(load, goalId)).map((r) => r.title);
}
