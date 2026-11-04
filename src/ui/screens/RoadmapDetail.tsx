// S13 — Roadmap detail `#/roadmaps/:id` (phase 8, M19; DESIGN v8.0 S13; FR-70 … FR-73; A-81). Lazy route (ADR-53).
// Overview, week strip, "This week", phases with item rows and the quick actions (tick, actual dates, note). Every
// write goes through RoadmapService and the live query re-emits the whole view, so nothing here is optimistic.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toISODate } from '../../domain/dates';
import type { ItemInput, RoadmapItem, RoadmapPhase } from '../../domain/roadmap';
import type { RoadmapView } from '../../domain/roadmap-progress';
import type { DomainError, Result } from '../../domain/types';
import { LinkButton } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { OverviewMetrics } from '../components/roadmap/OverviewMetrics';
import { RoadmapItemRow, type ItemError, type ItemField } from '../components/roadmap/RoadmapItemRow';
import { RoadmapNotFound } from '../components/roadmap/RoadmapNotFound';
import { ThisWeekCard } from '../components/roadmap/ThisWeekCard';
import { useRoadmapDetail, type RoadmapServiceState } from '../components/roadmap/useRoadmapService';
import { WeekStrip } from '../components/roadmap/WeekStrip';
import { useDelayed } from '../hooks/useDelayed';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import '../styles/roadmaps.css';

export function RoadmapDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { tm } = useT('roadmap');
  const today = toISODate(useNow());
  const [attempt, setAttempt] = useState(0);
  const { service, error: loadError, view, viewError } = useRoadmapDetail(id, today, attempt);
  const showSkeleton = useDelayed(view === undefined && loadError === undefined && viewError === undefined);

  if (loadError !== undefined || viewError !== undefined) {
    return <ErrorState title={tm('errors.loadViewTitle')} body={tm('errors.loadViewBody')} actionLabel={tm('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  }
  if (view === undefined) return showSkeleton ? <Skeleton blocks={3} /> : null;
  if (view === null) return <RoadmapNotFound />;
  return <RoadmapDetailView key={id} view={view} today={today} service={service!} />;
}

type Service = NonNullable<RoadmapServiceState['service']>;

function RoadmapDetailView({ view, today, service }: { view: RoadmapView; today: string; service: Service }) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const { roadmap, phases, items, overview, linkState, goal } = view;
  useDocumentTitle(roadmap.title);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const [errors, setErrors] = useState<Record<string, ItemError>>({});
  const [announce, setAnnounce] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Run one quick action; a failed `Result` or a thrown write becomes the item's inline error (cleared on success). */
  const run = useCallback(async (itemId: string, field: ItemField, action: () => Promise<Result<RoadmapItem>>): Promise<boolean> => {
    setBusyId(itemId);
    try {
      const r = await action();
      if (r.ok) {
        setErrors((e) => (itemId in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== itemId)) : e));
        return true;
      }
      const err: DomainError = r.errors[0]!;
      setErrors((e) => ({ ...e, [itemId]: { field: (err.field as ItemField | undefined) ?? field, error: err } }));
      return false;
    } catch {
      setErrors((e) => ({ ...e, [itemId]: { field, error: 'write' } }));
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  const tick = async (item: RoadmapItem, done: boolean) => {
    if (await run(item.id, 'actualEnd', () => service.setItemDone(item.id, done, today))) setAnnounce(t(done ? 'item.statusDone' : 'item.statusUndone', { title: item.title }));
  };
  const setDate = (item: RoadmapItem, which: 'start' | 'end', value: string | null) => {
    void run(item.id, which === 'start' ? 'actualStart' : 'actualEnd', () => service.setItemActual(item.id, which, value, today));
  };
  const setNote = (item: RoadmapItem, note: string) => {
    const input: ItemInput = { title: item.title, note, plannedStart: item.plannedStart, plannedEnd: item.plannedEnd, actualStart: item.actualStart, actualEnd: item.actualEnd };
    void run(item.id, 'note', () => service.updateItem(item.id, input, today));
  };

  /** Strip cell → scroll the item row into view and focus it (DESIGN S13 "Dải ô"; reduced motion → no smooth scroll). */
  const selectItem = (itemId: string) => {
    const el = document.getElementById(`rm-item-${itemId}`);
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  const byPhase = new Map<string, RoadmapItem[]>();
  for (const i of items) byPhase.set(i.phaseId, [...(byPhase.get(i.phaseId) ?? []), i]);
  const hoursKnown = view.hoursDoneMinutes !== null;
  const current = items.find((i) => i.id === overview.currentItemId);

  const goalLine =
    linkState === 'none' ? (
      <p className="rd-goal" data-testid="detail-goal">
        {t('detail.goalNone')}
      </p>
    ) : linkState === 'missing' ? (
      <p className="rd-goal" data-testid="detail-goal">
        {t('detail.goalMissing')}
      </p>
    ) : (
      <p className="rd-goal" data-testid="detail-goal">
        {t('detail.goal')}: <Link to={`/goals/${roadmap.goalId}`}>{goal?.name}</Link>
        {linkState === 'archived' ? (
          <>
            {' '}
            <span className="rd-tag">{t('detail.goalArchived')}</span>
          </>
        ) : null}
      </p>
    );

  const phaseSections = (
    <div data-testid="phases">
      {phases.map((phase: RoadmapPhase) => {
        const list = byPhase.get(phase.id) ?? [];
        const done = list.filter((i) => i.actualEnd !== null).length;
        return (
          <section key={phase.id} className="rd-ph" aria-label={phase.title} data-testid="phase" data-phase={phase.id}>
            <div className="rd-ph-head">
              <h3>{phase.title}</h3>
              <span className="rd-ph-count num" data-testid="phase-progress">
                {t('phase.progress', { done: f.number(done), total: f.number(list.length) })}
              </span>
            </div>
            {phase.note ? (
              <p className="rd-ph-note" data-testid="phase-note">
                {phase.note}
              </p>
            ) : null}
            {list.map((item) => (
              <RoadmapItemRow
                key={item.id}
                item={item}
                isCurrent={item.id === overview.currentItemId}
                weekBased={overview.weekBased}
                minutes={view.itemMinutes.get(item.id) ?? null}
                today={today}
                error={errors[item.id] ?? null}
                onTick={(done) => void tick(item, done)}
                onDate={(which, value) => setDate(item, which, value)}
                onNote={(note) => setNote(item, note)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );

  const aside = (
    <aside className="rd-aside">
      {roadmap.note ? (
        <section className="rd-sec" aria-labelledby="rd-note-h" data-testid="roadmap-note">
          <h2 className="eyebrow" id="rd-note-h">
            {t('note.title')}
          </h2>
          <p className="rd-note">{roadmap.note}</p>
        </section>
      ) : null}
      <section className="rd-sec">
        <details className="rd-how" data-testid="how-hours">
          <summary>{t('howHours.summary')}</summary>
          <p>{t('howHours.body')}</p>
        </details>
      </section>
    </aside>
  );

  return (
    <>
      <LinkButton variant="ghost" icon="left" className="back" to="/roadmaps">
        {t('detail.back')}
      </LinkButton>
      <header className="rd-head">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            {roadmap.title}
          </h1>
          {goalLine}
        </div>
        <LinkButton variant="secondary" to={`/roadmaps/${roadmap.id}/edit`} data-testid="detail-edit">
          {t('detail.edit')}
        </LinkButton>
      </header>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="detail-status">
        {announce}
      </div>
      <OverviewMetrics view={view} />
      {items.length === 0 ? (
        <>
          <div className="empty card" data-testid="detail-empty">
            <h2>{t('detail.noItems')}</h2>
            <p>{t('detail.noItemsBody')}</p>
            <LinkButton variant="primary" to={`/roadmaps/${roadmap.id}/edit`}>
              {t('detail.edit')}
            </LinkButton>
          </div>
          {aside}
        </>
      ) : (
        <>
          <WeekStrip items={items} currentItemId={overview.currentItemId} weekBased={overview.weekBased} today={today} onSelect={selectItem} />
          <div className="rd-cols">
            <div>
              <ThisWeekCard view={view.thisWeek} items={items} weekBased={overview.weekBased} hoursKnown={hoursKnown} busy={busyId !== null && busyId === current?.id} onToggleDone={(itemId, done) => void tick(items.find((i) => i.id === itemId)!, done)} />
              {phaseSections}
            </div>
            {aside}
          </div>
        </>
      )}
    </>
  );
}
