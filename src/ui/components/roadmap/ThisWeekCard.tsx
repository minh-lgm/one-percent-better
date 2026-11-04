// S13 "This week" card (DESIGN v8.0 S13 "Thẻ This week", FR-73; v8.2 `gap`). Lazy-only (ADR-53).
import type { RoadmapItem } from '../../../domain/roadmap';
import type { ThisWeek } from '../../../domain/roadmap-progress';
import { Button } from '../Button';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';

export interface ThisWeekCardProps {
  view: ThisWeek;
  /** In item order (for the titles). */
  items: readonly RoadmapItem[];
  weekBased: boolean;
  /** `false` when the roadmap has no linked goal (link state none / missing): minutes show as `—`, no progress bar. */
  hoursKnown: boolean;
  busy?: boolean;
  onToggleDone: (itemId: string, done: boolean) => void;
}

export function ThisWeekCard({ view, items, weekBased, hoursKnown, busy = false, onToggleDone }: ThisWeekCardProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  if (view === null) return null;
  const eyebrow = t(weekBased ? 'now.eyebrowWeek' : 'now.eyebrowItem');
  if (view.kind !== 'current') {
    const text =
      view.kind === 'notStarted'
        ? t('now.beforeStart', { date: f.dateShort(view.start), title: items.find((i) => i.id === view.firstItemId)?.title ?? '' })
        : view.kind === 'finished'
          ? t('now.after', { date: f.dateShort(view.end) })
          : t('now.gap');
    return (
      <section className="rd-sec rd-now" data-testid="this-week" data-kind={view.kind}>
        <p className="eyebrow">{eyebrow}</p>
        <p className="rd-now-text">{text}</p>
      </section>
    );
  }
  const item = items.find((i) => i.id === view.itemId);
  if (!item) return null;
  const range = f.itemRange(item.plannedStart, item.plannedEnd);
  const label = weekBased ? t('now.eyebrowIndexed', { label: eyebrow, n: f.number(view.index), range }) : t('now.eyebrow', { label: eyebrow, range });
  const done = view.itemMinutes ?? 0;
  const target = view.itemTargetMinutes;
  const big = !hoursKnown ? t('noValue') : target === null ? t('now.minutesOnly', { done: f.number(done) }) : t('now.minutesOfTarget', { done: f.number(done), target: f.number(target) });
  return (
    <section className="rd-sec rd-now" data-testid="this-week" data-kind="current" data-item={item.id}>
      <p className="eyebrow num" data-testid="this-week-eyebrow">
        {label}
      </p>
      <h3 className="rd-now-title">{item.title}</h3>
      <div className="rd-now-row num">
        <span className="rd-now-big" data-testid="this-week-minutes">
          {big}
        </span>
        <span data-testid="this-week-days">{view.daysLeft === 0 ? t('now.lastDay') : t('now.daysLeft', { count: view.daysLeft })}</span>
      </div>
      {hoursKnown && target !== null ? (
        <div
          className="rd-bar"
          role="progressbar"
          aria-label={t(weekBased ? 'now.progressLabel' : 'now.progressLabelItem')}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(done, target)}
          aria-valuetext={t('now.progressValue', { done: f.number(done), target: f.number(target) })}
        >
          <i style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
        </div>
      ) : null}
      <div className="rd-now-actions">
        <Button variant="secondary" data-testid="this-week-toggle" disabled={busy} aria-busy={busy || undefined} onClick={() => onToggleDone(item.id, !view.done)}>
          {view.done ? t('item.undoDone') : t('item.markDone')}
        </Button>
      </div>
    </section>
  );
}
