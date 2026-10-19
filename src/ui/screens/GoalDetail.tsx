import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { curve, growthPercent } from '../../domain/curve';
import { toISODate, yearOf } from '../../domain/dates';
import { dailyTarget, goalStatus } from '../../domain/goal';
import { goalStats } from '../../domain/stats';
import type { DomainError, Goal, GoalStatus } from '../../domain/types';
import { Alert } from '../components/Alert';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { HistoryTable } from '../components/HistoryTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { Skeleton } from '../components/Skeleton';
import { StatCard } from '../components/StatCard';
import { errorMessage } from '../error-messages';
import { useDelayed } from '../hooks/useDelayed';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import { NotFound } from './NotFound';

// Recharts lives in its own chunk (ADR-10, NFR-03); the screen itself is lazy too (M5-T2).
const CurveChart = lazy(() => import('../components/CurveChart'));

const TONES: Record<GoalStatus, BadgeTone> = { active: 'success', upcoming: 'info', ended: 'neutral', archived: 'neutral' };
/** Range control default (DESIGN A-D4): whole period up to 120 days, otherwise "so far". */
const WHOLE_PERIOD_MAX_DAYS = 120;

type Range = 'whole' | 'sofar';

interface PendingDelete {
  entryCount: number;
  timerRunning: boolean;
  opener: HTMLElement | null;
}

/** Catches a failed chart chunk → ErrorState + Retry (DESIGN S4 error). */
class ChunkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** S4 — Goal detail `#/goals/:id` (FR-18, FR-27 v3.0, FR-28, FR-30). */
export function GoalDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useT();
  const { goalService } = useServices();
  const [attempt, setAttempt] = useState(0);
  const goals = useSubscribable(() => goalService.watchAll(), [goalService, attempt]);
  const goal = goals.data?.find((g) => g.id === id);
  const showSkeleton = useDelayed(goals.loading);
  // While this screen deletes its own goal the live query drops it before the navigation
  // to Goals renders; show nothing instead of a flash of "Goal not found" (M5-D1).
  const [deleting, setDeleting] = useState(false);

  if (goals.error) return <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  if (goals.loading) return showSkeleton ? <Skeleton /> : null;
  if (!goal) return deleting ? null : <NotFound variant="goal" />;
  return <GoalDetailView key={goal.id} goal={goal} onDeleting={setDeleting} />;
}

function GoalDetailView({ goal, onDeleting }: { goal: Goal; onDeleting: (deleting: boolean) => void }) {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { goalService, entryService, timerService } = useServices();
  const today = toISODate(useNow());
  const status = goalStatus(goal, today);
  // v4.0 (DESIGN S4 "Goal không thời hạn"): no Range control, "Day {k}" without a total, chart only once started.
  const openEnded = goal.endDate === null;
  useDocumentTitle(goal.name);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const [attempt, setAttempt] = useState(0);
  const entries = useSubscribable(() => entryService.watchByGoal(goal.id), [entryService, goal.id, attempt]);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<DomainError | 'write' | null>(null);
  const [archiving, setArchiving] = useState(false);

  const model = useMemo(() => {
    if (!entries.data) return null;
    return { curve: curve(goal, entries.data, today), stats: goalStats(goal, entries.data, yearOf(today), today) };
  }, [goal, entries.data, today]);

  // Range: the user's choice, else the A-D4 default derived from the period (no effect, so the
  // first render with data already shows the right option).
  const [chosenRange, setRange] = useState<Range | null>(null);
  const range: Range = chosenRange ?? (model && model.curve.periodDays > WHOLE_PERIOD_MAX_DAYS ? 'sofar' : 'whole');
  const [tableOpen, setTableOpen] = useState(false);

  const closeDialog = useCallback(() => {
    const opener = pending?.opener;
    setPending(null);
    requestAnimationFrame(() => opener?.focus());
  }, [pending]);

  async function openDelete(opener: HTMLElement) {
    const [entryCount, timer] = await Promise.all([goalService.entryCount(goal.id), timerService.current()]);
    setPending({ entryCount, timerRunning: timer?.goalId === goal.id, opener });
  }

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    onDeleting(true);
    let removed = false;
    try {
      const r = await goalService.remove(goal.id);
      if (r.ok) {
        removed = true;
        toast.show('toast.goalDeleted');
        setPending(null);
        void navigate('/goals', { replace: true });
      }
    } finally {
      setBusy(false);
      if (!removed) onDeleting(false);
    }
  }

  async function toggleArchive() {
    if (archiving) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const r = await goalService.setArchived(goal.id, !goal.archived, new Date());
      if (r.ok) toast.show(goal.archived ? 'toast.goalRestored' : 'toast.goalArchived');
      else setArchiveError(r.errors[0] ?? null);
    } catch {
      setArchiveError('write');
    } finally {
      setArchiving(false);
    }
  }

  const info =
    goal.endDate === null
      ? t('goals.rowDailyOpen', { n: f.number(goal.targetMinutes), start: f.dateShort(goal.startDate) })
      : goal.targetType === 'daily'
        ? t('goals.rowDaily', { n: f.number(goal.targetMinutes), range: f.dateRange(goal.startDate, goal.endDate) })
        : t('goals.rowTotal', { daily: f.number(dailyTarget(goal)), hours: f.number(goal.targetMinutes / 60), range: f.dateRange(goal.startDate, goal.endDate) });

  const deleteBody = pending ? (pending.entryCount === 0 ? t('goal.delete.bodyNoEntries') : t('goal.delete.body', { count: pending.entryCount })) : '';
  const archiveErrorText = archiveError === null ? null : archiveError === 'write' ? t('errors.WRITE_FAILED') : (({ key, params }) => t(key, params))(errorMessage(archiveError, f));
  const days = (n: number) => t('format.daysCount', { count: n });
  const dash = t('common.emptyValue');
  const durationOf = (minutes: number) => (minutes < 60 ? f.minutes(minutes) : f.duration(minutes));

  let body: ReactNode;
  if (entries.error) {
    body = <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  } else if (!model) {
    body = <Skeleton blocks={3} />;
  } else {
    const { curve: c, stats } = model;
    const upcoming = c.elapsedDays === 0;
    // Open-ended: the period IS the elapsed part (no future days), so Range would offer the same data twice (A-D55).
    const visibleCount = range === 'sofar' && !upcoming && !openEnded ? c.elapsedDays : c.periodDays;
    const ideal = c.ideal.slice(0, visibleCount);
    // v3 (FR-27, DESIGN S4 / 7.6.4 "Biến thể nào dùng khi nào"): every % goes through the signed formatter.
    const down = c.headlinePercent < 0;
    const headline = t(down ? 'goal.detail.headlineDown' : 'goal.detail.headline', { value: f.signed1(c.headlinePercent) });
    const dayOf = { k: f.number(c.elapsedDays), total: f.number(c.periodDays) };
    const dayLine = openEnded ? t('goal.detail.subDayOpen', { k: dayOf.k }) : t('goal.detail.subDay', dayOf);
    const summary = upcoming
      ? t('goal.detail.upcoming', { date: f.dateShort(goal.startDate) })
      : c.baseline === null
        ? t(openEnded ? 'goal.detail.chartSummaryEmptyOpen' : 'goal.detail.chartSummaryEmpty', { ...dayOf, y: f.signed1(c.idealPercent) })
        : t(openEnded ? 'goal.detail.chartSummaryOpen' : 'goal.detail.chartSummary', { ...dayOf, x: f.signed1(c.headlinePercent), y: f.signed1(c.idealPercent) });
    let subVariant: 'upcoming' | 'empty' | 'start' | 'today' | 'earlier';
    let subText: string;
    if (upcoming) {
      subVariant = 'upcoming';
      subText = t('goal.detail.upcoming', { date: f.dateShort(goal.startDate) });
    } else if (!c.baseline || !c.latest) {
      subVariant = 'empty';
      subText = t('empty.detail.curve');
    } else if (!c.previous || c.latestChangePercent === null) {
      subVariant = 'start';
      subText = t('goal.detail.subStart', { minutes: f.minutes(c.baseline.minutes), date: f.dateMonthDay(c.baseline.date) });
    } else {
      const params = {
        minutes: f.minutes(c.latest.minutes),
        change: f.signed1(c.latestChangePercent),
        prevDate: f.dateMonthDay(c.previous.date),
        prevMinutes: f.minutes(c.previous.minutes),
        factor: f.factor(c.actualFactor),
        firstDate: f.dateMonthDay(c.baseline.date),
        firstMinutes: f.minutes(c.baseline.minutes),
      };
      if (c.latest.date === today) {
        subVariant = 'today';
        subText = t('goal.detail.subToday', params);
      } else {
        subVariant = 'earlier';
        subText = t('goal.detail.subEarlier', { ...params, date: f.dateMonthDay(c.latest.date) });
      }
    }
    let paceText = t('stat.paceOnTrack');
    if (stats.pace > 0) paceText = t('stat.paceAhead', { value: durationOf(stats.pace) });
    else if (stats.pace < 0) paceText = t('stat.paceBehind', { value: durationOf(-stats.pace) });
    const chunkError = <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => window.location.reload()} />;

    body = (
      <>
        <section className="card section headline-card" aria-labelledby="hl">
          <p className="hl-label muted small">{t('goal.detail.eyebrow')}</p>
          <p id="hl" className={down ? 'hl hl-down num' : 'hl num'} data-testid="headline" data-sign={down ? 'negative' : 'positive'}>
            {headline}
          </p>
          {upcoming ? null : (
            <p className="muted num hl-day" data-testid="headline-day">
              {dayLine}
            </p>
          )}
          <p className="muted num" data-testid="headline-sub" data-variant={subVariant}>
            {subText}
          </p>
        </section>

        {/* An open-ended goal that has not started has nothing to draw (A-52, A-D58): no chart card at all. */}
        {openEnded && upcoming ? null : (
        <section className="card section" aria-labelledby="ch-h">
          <div className="chart-head">
            <h2 id="ch-h">{t('goal.detail.chartTitle')}</h2>
            {upcoming || openEnded ? null : (
              <SegmentedControl<Range>
                name="curve-range"
                legend={t('goal.detail.rangeLegend')}
                legendHidden
                className="range"
                value={range}
                onChange={setRange}
                options={[
                  { value: 'whole', label: t('goal.detail.rangeWhole') },
                  { value: 'sofar', label: t('goal.detail.rangeSoFar') },
                ]}
              />
            )}
          </div>
          <figure className="chart-figure cv" aria-labelledby="curve-cap">
            <figcaption id="curve-cap" className="sr-only">
              {t('goal.detail.chartCaption')}
            </figcaption>
            <ChunkBoundary fallback={chunkError}>
              <Suspense fallback={<Skeleton blocks={1} />}>
                <CurveChart ideal={ideal} actual={c.actual} label={summary} testId="curve-chart" />
              </Suspense>
            </ChunkBoundary>
          </figure>
          <ul className="legend" data-testid="curve-legend">
            <li>
              <svg width="34" height="10" aria-hidden="true" focusable="false">
                <line x1="1" y1="5" x2="33" y2="5" className="line-ideal" />
              </svg>
              {t('goal.detail.legendIdeal')}
            </li>
            <li>
              <svg width="34" height="10" aria-hidden="true" focusable="false">
                <line x1="1" y1="5" x2="33" y2="5" className="line-you" />
              </svg>
              {t('goal.detail.legendYou')}
            </li>
            <li>
              <svg width="34" height="10" aria-hidden="true" focusable="false">
                <line x1="1" y1="5" x2="33" y2="5" className="line-zero" />
              </svg>
              {t('goal.detail.legendZero')}
            </li>
          </ul>
          <p className="curve-summary num" data-testid="curve-summary">
            {summary}
          </p>
          <p className="muted small" data-testid="curve-note">
            {t('goal.detail.chartNote')}
          </p>
          {/* The data table is only mounted while open; its scroll box is focusable (axe scrollable-region-focusable). */}
          <details className="curve-table" onToggle={(e) => setTableOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t('goal.detail.showTable')}</summary>
            {tableOpen ? (
              <div className="tbl-wrap" tabIndex={0} role="region" aria-label={t('goal.detail.showTable')}>
                <table className="num" data-testid="curve-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('goal.detail.tableDate')}</th>
                      <th scope="col">{t('goal.detail.tableIdeal')}</th>
                      <th scope="col">{t('goal.detail.tableYou')}</th>
                      <th scope="col">{t('goal.detail.tableMinutes')}</th>
                      <th scope="col">{t('goal.detail.tableChange')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideal.map((p, i) => {
                      // Future days and the "nothing logged yet" state show "—" in the You columns (DESIGN S4).
                      const a = c.baseline ? c.actual[i] : undefined;
                      return (
                        <tr key={p.date}>
                          <th scope="row">{f.dateShort(p.date)}</th>
                          <td>{t('format.percent', { value: f.signed1(growthPercent(p.value)) })}</td>
                          <td>{a ? t('format.percent', { value: f.signed1(a.percent) }) : dash}</td>
                          <td>{a ? f.number(a.minutes) : dash}</td>
                          <td>{a && a.changePercent !== null ? t('format.percent', { value: f.signed1(a.changePercent) }) : dash}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </details>
        </section>
        )}

        <div className="stats" data-testid="stats">
          <StatCard
            testId="stat-progress"
            label={t('stat.progress')}
            value={f.percent1(stats.progressPercent)}
            sub={t(openEnded ? 'stat.progressSubOpen' : 'stat.progressSub', { current: f.number(stats.minutesTotal), total: f.number(stats.totalTarget) })}
            progress={{ value: stats.progressPercent, label: t('stat.progress'), valueText: f.percent1(stats.progressPercent) }}
          />
          <StatCard testId="stat-pace" label={t('stat.pace')} value={paceText} sub={t('stat.paceExpected', { n: f.number(stats.expectedMinutes) })} textValue />
          <StatCard testId="stat-current" label={t('stat.currentStreak')} value={days(stats.currentStreak)} />
          <StatCard testId="stat-longest" label={t('stat.longestStreak')} value={days(stats.longestStreak)} />
        </div>
      </>
    );
  }

  // History is independent of the curve model (M3 behaviour): rendered as soon as the entries arrive.
  const history = entries.error ? null : (
    <section className="card section" aria-labelledby="hist-h">
      <h2 id="hist-h">{t('goal.detail.historyTitle')}</h2>
      {entries.loading ? null : entries.data && entries.data.length > 0 ? (
        <HistoryTable entries={entries.data} />
      ) : (
        <EmptyState compact heading="h3" title={t('empty.detail.history')} body={t('empty.detail.historyBody')} />
      )}
    </section>
  );

  return (
    <>
      <LinkButton variant="ghost" icon="left" className="back" to="/goals">
        {t('nav.goals')}
      </LinkButton>
      <header className="gd-head">
        <div>
          <div className="top">
            <h1 ref={headingRef} tabIndex={-1}>
              {goal.name}
            </h1>
            <Badge tone={TONES[status]}>{t(`goal.status.${status}`)}</Badge>
          </div>
          {goal.why ? <p className="why">{goal.why}</p> : null}
          <p className="muted small num">{info}</p>
        </div>
        <div className="gd-actions">
          <LinkButton variant="secondary" to={`/goals/${goal.id}/edit`}>
            {t('common.edit')}
          </LinkButton>
          <Button variant="secondary" icon={goal.archived ? 'restore' : 'archive'} onClick={() => void toggleArchive()} disabled={archiving} aria-busy={archiving || undefined}>
            {goal.archived ? t('goals.restore') : t('goals.archive')}
          </Button>
          <Button variant="danger-ghost" onClick={(e) => void openDelete(e.currentTarget)}>
            {t('common.delete')}
          </Button>
        </div>
        {archiveErrorText ? (
          <div className="gd-alert">
            <Alert>{archiveErrorText}</Alert>
          </div>
        ) : null}
      </header>

      {body}
      {history}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? t('goal.delete.title', { name: goal.name }) : ''}
        body={deleteBody}
        extra={pending?.timerRunning ? t('goal.delete.timerNote') : undefined}
        confirmLabel={t('goal.delete.confirm')}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={closeDialog}
      />
    </>
  );
}
