import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toISODate, yearOf } from '../../domain/dates';
import { buildHeatmap } from '../../domain/heatmap';
import { monthlySeries, overallStats, weeklySeries, type GoalStats } from '../../domain/stats';
import type { Goal } from '../../domain/types';
import { availableYears, StatsService } from '../../services/stats-service';
import type { BarPoint } from '../components/BarChart';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Heatmap } from '../components/Heatmap';
import { PageHeader } from '../components/PageHeader';
import { Select } from '../components/Select';
import { Skeleton } from '../components/Skeleton';
import { StatCard } from '../components/StatCard';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';

// Recharts lives in its own chunk (ADR-10, NFR-03).
const BarChart = lazy(() => import('../components/BarChart'));

const ALL = 'all';
const MIN_YEAR = 1970;

function parseYear(raw: string | null, currentYear: number): number | null {
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  return y >= MIN_YEAR && y <= currentYear ? y : null;
}

/** Catches a failed chart chunk (offline before precache) → ErrorState + Retry (DESIGN S6 error). */
class ChunkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Review() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { statsService } = useServices();
  const now = useNow();
  const today = toISODate(now);
  const currentYear = yearOf(today);
  const [params, setParams] = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const data = useSubscribable(() => statsService.watch(), [statsService, attempt]);
  const showSkeleton = useDelayed(data.loading);

  const goals = useMemo(() => data.data?.goals ?? [], [data.data]);
  const entries = useMemo(() => data.data?.entries ?? [], [data.data]);

  const goalParam = params.get('goal');
  const goal: Goal | null = (goalParam && goalParam !== ALL && goals.find((g) => g.id === goalParam)) || null;
  const year = parseYear(params.get('year'), currentYear) ?? currentYear;
  const years = useMemo(() => {
    const list = availableYears(goals, entries, currentYear);
    return list.includes(year) ? list : [...list, year].sort((a, b) => b - a);
  }, [goals, entries, currentYear, year]);

  const select = (nextGoal: string, nextYear: number) => {
    setParams({ goal: nextGoal, year: String(nextYear) }, { replace: true });
  };

  const model = useMemo(() => {
    if (!data.data) return null;
    const selected = goal ? entries.filter((e) => e.goalId === goal.id) : entries;
    const goalStat: GoalStats | undefined = goal ? StatsService.allGoalStats({ goals: [goal], entries: selected }, year, today).get(goal.id) : undefined;
    return {
      overall: overallStats(goals, entries, year, today),
      goalStat,
      grid: buildHeatmap({ year, goal, goals, entries, today }),
      weekly: weeklySeries(selected, today),
      monthly: monthlySeries(selected, year, today),
    };
  }, [data.data, goal, goals, entries, year, today]);

  const title = t('review.title');
  const retry = () => window.location.reload();
  const chunkError = <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={retry} />;

  if (data.error) {
    return (
      <>
        <PageHeader title={title} />
        <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />
      </>
    );
  }
  if (!model) {
    return (
      <>
        <PageHeader title={title} />
        {showSkeleton ? <Skeleton blocks={3} /> : null}
      </>
    );
  }
  if (goals.length === 0) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState title={t('empty.review')} body={t('empty.reviewBody')} actionLabel={t('empty.reviewAction')} actionTo="/goals/new" />
      </>
    );
  }

  const { overall, goalStat, grid, weekly, monthly } = model;
  const yearText = String(year);
  const goalName = goal ? goal.name : t('review.goalAll');
  const days = (n: number) => t('format.daysCount', { count: n });
  const durationOf = (minutes: number) => (minutes < 60 ? f.minutes(minutes) : f.duration(minutes));

  const minutesInYear = goal ? goalStat!.minutesInYear : overall.minutesInYear;
  const daysOnTarget = goal ? goalStat!.daysOnTarget : overall.daysOnTarget;
  const daysLogged = goal ? goalStat!.daysLogged : overall.daysLogged;
  const current = goal ? goalStat!.currentStreak : overall.currentStreak;
  const longest = goal ? goalStat!.longestStreak : overall.longestStreak;
  const outsideYear = goalStat?.outsideYear ?? false;

  let paceText = t('stat.paceOnTrack');
  if (goalStat && goalStat.pace > 0) paceText = t('stat.paceAhead', { value: durationOf(goalStat.pace) });
  else if (goalStat && goalStat.pace < 0) paceText = t('stat.paceBehind', { value: durationOf(-goalStat.pace) });

  const heatmapSummary = outsideYear
    ? t('review.outsideYear', { year: yearText })
    : minutesInYear === 0
      ? t('empty.reviewYear', { year: yearText })
      : t('heatmap.summary', { year: yearText, logged: days(daysLogged), met: days(daysOnTarget), streak: days(longest) });

  const weeklyPoints: BarPoint[] = weekly.map((w) => ({ key: w.start, tick: f.dateMonthDay(w.start), label: t('format.dateRange', { start: f.dateMonthDay(w.start), end: f.dateMonthDay(w.end) }), minutes: w.minutes, current: w.current }));
  const monthlyPoints: BarPoint[] = monthly.map((m) => ({ key: m.date, tick: f.monthShort(m.date), label: f.monthYear(m.date), minutes: m.minutes, current: m.current }));
  const weeklyTotal = weekly.reduce((a, w) => a + w.minutes, 0);
  const monthlyTotal = monthly.reduce((a, m) => a + m.minutes, 0);
  const busiestWeek = weekly.reduce((best, w) => (w.minutes > best.minutes ? w : best), weekly[0]);
  const busiestMonth = monthly.reduce((best, m) => (m.minutes > best.minutes ? m : best), monthly[0]);
  const weeklySummary = weeklyTotal === 0 ? t('chart.bar.empty') : t('chart.bar.weeklySummary', { total: f.duration(weeklyTotal), date: f.dateMonthDay(busiestWeek.start), max: f.duration(busiestWeek.minutes) });
  const monthlySummary = monthlyTotal === 0 ? t('chart.bar.empty') : t('chart.bar.monthlySummary', { year: yearText, total: f.duration(monthlyTotal), month: f.monthLong(busiestMonth.date), max: f.duration(busiestMonth.minutes) });
  const chartFallback = <Skeleton blocks={1} />;

  return (
    <div className="review">
      <PageHeader title={title} />
      <div className="controls">
        <Select
          id="review-goal"
          label={t('review.goalLabel')}
          value={goal?.id ?? ALL}
          onChange={(v) => select(v, year)}
          options={[{ value: ALL, label: t('review.goalAll') }, ...goals.map((g) => ({ value: g.id, label: g.archived ? t('review.goalArchived', { name: g.name }) : g.name }))]}
        />
        <Select id="review-year" label={t('review.yearLabel')} value={yearText} onChange={(v) => select(goal?.id ?? ALL, Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
      </div>

      <div className="stats" data-testid="stats">
        <StatCard
          testId="stat-time"
          label={t('stat.timeLogged')}
          value={f.hours(minutesInYear)}
          sub={
            <>
              <span>{t('stat.timeLoggedYear', { year: yearText })}</span>
              {goalStat ? (
                <>
                  {' · '}
                  <span>{t('stat.timeLoggedWhole', { hours: f.hours(goalStat.minutesTotal) })}</span>
                </>
              ) : null}
            </>
          }
        />
        <StatCard testId="stat-days" label={t('stat.daysOnTarget')} value={f.number(daysOnTarget)} sub={goal ? t('stat.daysOnTargetSub') : t('stat.anyGoal')} />
        {goalStat ? (
          <>
            <StatCard
              testId="stat-progress"
              label={t('stat.progress')}
              value={f.percent1(goalStat.progressPercent)}
              sub={t('stat.progressSub', { current: f.number(goalStat.minutesTotal), total: f.number(goalStat.totalTarget) })}
              progress={{ value: goalStat.progressPercent, label: t('stat.progress'), valueText: f.percent1(goalStat.progressPercent) }}
            />
            <StatCard testId="stat-pace" label={t('stat.pace')} value={paceText} sub={t('stat.paceExpected', { n: f.number(goalStat.expectedMinutes) })} textValue />
          </>
        ) : null}
        <StatCard testId="stat-current" label={t('stat.currentStreak')} value={days(current)} sub={goal ? undefined : t('stat.anyGoal')} />
        <StatCard testId="stat-longest" label={t('stat.longestStreak')} value={days(longest)} />
      </div>
      <p className="hint stats-note" data-testid="stats-note">
        {goal ? (outsideYear ? t('review.outsideYear', { year: yearText }) : t('review.progressNote')) : t('review.pickGoal')}
      </p>

      <section className="card sec" aria-labelledby="hm-h">
        <h2 id="hm-h">{t('review.heatmapTitle', { year: yearText })}</h2>
        <p className="muted small" data-testid="heatmap-summary">
          {heatmapSummary}
        </p>
        <Heatmap grid={grid} mode={goal ? 'goal' : 'all'} goalName={goalName} onSelect={(date) => navigate(`/day/${date}`)} />
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="wk-h">
          <h2 id="wk-h">{t('review.weeklyTitle')}</h2>
          <p className="muted small">{t('review.weeklySub')}</p>
          <ChunkBoundary fallback={chunkError}>
            <Suspense fallback={chartFallback}>
              <BarChart testId="chart-weekly" points={weeklyPoints} caption={t('review.weeklyTitle')} columnHeader={t('chart.bar.colWeek')} summary={weeklySummary} />
            </Suspense>
          </ChunkBoundary>
        </section>
        <section className="card" aria-labelledby="mo-h">
          <h2 id="mo-h">{t('review.monthlyTitle', { year: yearText })}</h2>
          <p className="muted small">{t('review.monthlySub')}</p>
          <ChunkBoundary fallback={chunkError}>
            <Suspense fallback={chartFallback}>
              <BarChart testId="chart-monthly" points={monthlyPoints} caption={t('review.monthlyTitle', { year: yearText })} columnHeader={t('chart.bar.colMonth')} summary={monthlySummary} />
            </Suspense>
          </ChunkBoundary>
        </section>
      </div>
    </div>
  );
}
