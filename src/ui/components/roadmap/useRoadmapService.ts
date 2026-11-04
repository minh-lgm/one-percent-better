// The big-goals service for the roadmap screens (phase 8; ADR-53). The container memoises the lazy load; `attempt`
// retries a failed one (offline before the chunk was cached). Lazy-only: imported by the roadmap screens only.
import { useEffect, useState } from 'react';
import type { RoadmapView } from '../../../domain/roadmap-progress';
import type { RoadmapService } from '../../../services/roadmap-service';
import { useServices } from '../../hooks/useServices';
import { useSubscribable } from '../../hooks/useSubscribable';

export interface RoadmapServiceState {
  service: RoadmapService | null;
  error: unknown;
}

export function useRoadmapService(attempt = 0): RoadmapServiceState {
  const { loadRoadmapService } = useServices();
  const [state, setState] = useState<RoadmapServiceState>({ service: null, error: undefined });
  useEffect(() => {
    let active = true;
    setState({ service: null, error: undefined });
    loadRoadmapService().then(
      (service) => active && setState({ service, error: undefined }),
      (error: unknown) => active && setState({ service: null, error }),
    );
    return () => {
      active = false;
    };
  }, [loadRoadmapService, attempt]);
  return state;
}

/** A `Subscribable` that never emits (while the service is still loading). */
export const NEVER = { subscribe: () => () => undefined };

export interface RoadmapDetailState extends RoadmapServiceState {
  /** `undefined` while loading, `null` when the id does not exist (or was deleted). */
  view: RoadmapView | null | undefined;
  viewError: unknown;
}

/**
 * The live `RoadmapView` of `id` for the detail and editor screens. The emission is tagged with the id it was
 * subscribed for, so moving from `#/roadmaps/a/edit` straight to `#/roadmaps/b/edit` never shows (or seeds a form
 * with) roadmap `a` while `b` is still loading.
 */
export function useRoadmapDetail(id: string, today: string, attempt = 0): RoadmapDetailState {
  const { service, error } = useRoadmapService(attempt);
  const sub = useSubscribable<{ id: string; view: RoadmapView | null }>(
    () => (service ? { subscribe: (next, fail) => service.watchDetail(id, today).subscribe((view) => next({ id, view }), fail) } : NEVER),
    [service, id, today, attempt],
  );
  return { service, error, view: sub.data && sub.data.id === id ? sub.data.view : undefined, viewError: sub.error };
}
