// S11 — Big goals list (phase 8, M17: rows + empty state; the create buttons come with M19/M20; DESIGN v8.0 S11).
// Lazy route (ADR-53): the service, the repository and the `roadmap` namespace are loaded by the route's `lazy()`.
import { useEffect, useState } from 'react';
import { toISODate } from '../../domain/dates';
import type { RoadmapListRow } from '../../domain/roadmap-progress';
import type { RoadmapService } from '../../services/roadmap-service';
import type { SyncStatus } from '../../domain/sync';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { PaceChip } from '../components/roadmap/PaceChip';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT, type RoadmapTFn } from '../hooks/useT';
import '../styles/roadmaps.css';

const NEVER = { subscribe: () => () => undefined };

/** The big-goals service, loaded on first use (memoised by the container); `attempt` retries a failed load. */
function useRoadmapService(attempt: number): { service: RoadmapService | null; error: unknown } {
  const { loadRoadmapService } = useServices();
  const [state, setState] = useState<{ service: RoadmapService | null; error: unknown }>({ service: null, error: undefined });
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

export function Roadmaps() {
  const { t, tm } = useT('roadmap');
  const f = useFormat();
  const today = toISODate(useNow());
  const [attempt, setAttempt] = useState(0);
  const { service, error: loadError } = useRoadmapService(attempt);
  const rows = useSubscribable<RoadmapListRow[]>(() => (service ? service.watchList(today) : NEVER), [service, today, attempt]);
  const showSkeleton = useDelayed(rows.loading && loadError === undefined);
  // v8.0 (M18, ADR-52): the account has no roadmap tables yet → one status line under the header (same key as the
  // Account card, main resources). `syncService` is null with the cloud off.
  const { syncService } = useServices();
  const sync = useSubscribable<SyncStatus>(() => (syncService ? syncService.watchStatus() : NEVER), [syncService]);
  const roadmapsUnavailable = (sync.data ?? syncService?.current())?.roadmapsUnavailable === true;

  if (loadError !== undefined || rows.error !== undefined) {
    return <ErrorState title={tm('errors.loadViewTitle')} body={tm('errors.loadViewBody')} actionLabel={tm('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <>
      <PageHeader title={t('list.title')} subtitle={t('list.intro')} />
      {roadmapsUnavailable ? (
        <p className="note rm-note" role="status" data-testid="roadmaps-unavailable">
          <Icon name="info" />
          <span>{tm('settings.account.roadmapsUnavailable')}</span>
        </p>
      ) : null}
      {rows.data === undefined ? (
        showSkeleton ? (
          <div role="status" aria-busy="true" className="rm-loading" data-testid="roadmaps-loading">
            <span className="sr-only">{t('loading')}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rm-sk" aria-hidden="true">
                <i style={{ width: '45%' }} />
                <i style={{ width: '80%' }} />
              </div>
            ))}
          </div>
        ) : null
      ) : rows.data.length === 0 ? (
        <div className="rm-empty" data-testid="roadmaps-empty">
          <h2>{t('list.empty')}</h2>
          <p>{t('list.emptyBody')}</p>
        </div>
      ) : (
        <ul className="rm-list" aria-label={t('list.listLabel')} data-testid="roadmaps-list">
          {rows.data.map((row) => (
            <RoadmapRow key={row.id} row={row} t={t} f={f} />
          ))}
        </ul>
      )}
    </>
  );
}

function goalLine(t: RoadmapTFn, row: RoadmapListRow): string {
  switch (row.linkState) {
    case 'linked':
      return t('list.row.linked', { goal: row.goalName ?? '' });
    case 'archived':
      return t('list.row.linkedArchived', { goal: row.goalName ?? '' });
    case 'missing':
      return t('list.row.missing');
    default:
      return t('list.row.unlinked');
  }
}

function milestoneWhen(t: RoadmapTFn, days: number): string {
  if (days > 0) return t('milestone.in', { count: days });
  return t(days === 0 ? 'milestone.today' : 'milestone.past');
}

/** One row (DESIGN S11 `RoadmapRow`). M17 renders it as plain content; M19 wraps it in the link to `#/roadmaps/:id`. */
function RoadmapRow({ row, t, f }: { row: RoadmapListRow; t: RoadmapTFn; f: ReturnType<typeof useFormat> }) {
  const hoursNone = row.hoursDoneMinutes === null;
  const hours = hoursNone
    ? t('list.row.hoursNone')
    : row.plannedMinutesToDate === null
      ? t('list.row.hoursOnly', { done: f.hoursShort(row.hoursDoneMinutes!) })
      : t('list.row.hours', { done: f.hoursShort(row.hoursDoneMinutes!), plan: f.hoursShort(row.plannedMinutesToDate) });
  const pct = row.itemCount === 0 ? 0 : Math.round((row.doneCount / row.itemCount) * 100);
  return (
    <li className="rm" data-testid="roadmap-row" data-id={row.id}>
      <div className="rm-top">
        <div className="rm-head">
          <h2 className="rm-title">{row.title}</h2>
          <PaceChip pace={row.pace} />
        </div>
        <p className="rm-goal" data-testid="roadmap-goal">
          {goalLine(t, row)}
        </p>
      </div>
      <div className="rm-side">
        <div className="rm-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="rm-stats">
          <span data-testid="roadmap-progress">{t('list.row.progress', { done: f.number(row.doneCount), total: f.number(row.itemCount) })}</span>
          <span className={hoursNone ? 'dash' : undefined} data-testid="roadmap-hours">
            {hours}
          </span>
          {row.milestoneDays !== null ? (
            <span data-testid="roadmap-milestone">{t('milestone.line', { label: row.milestoneLabel || t('milestone.defaultLabel'), when: milestoneWhen(t, row.milestoneDays) })}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
