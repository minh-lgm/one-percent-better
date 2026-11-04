// S13 "Overview" — the four metrics (DESIGN v8.0 S13 "Overview — 4 chỉ số", FR-72). Lazy-only (ADR-53).
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { RoadmapView } from '../../../domain/roadmap-progress';
import { useFormat } from '../../hooks/useFormat';
import { useT, type RoadmapTFn } from '../../hooks/useT';
import { PaceChip } from './PaceChip';

export function paceSub(t: RoadmapTFn, view: RoadmapView, dateShort: (d: string) => string): string {
  const { pace, start } = view.overview;
  switch (pace.kind) {
    case 'notStarted':
      return t('pace.subNotStarted', { date: start ? dateShort(start) : '' });
    case 'onTrack':
      return t('pace.subOnTrack');
    case 'completed':
      return t('pace.subCompleted');
    case 'empty':
      return t('pace.subEmpty');
    case 'behind':
      return t(pace.severity === 'crit' ? 'pace.subCrit' : 'pace.subWarn');
  }
}

export function OverviewMetrics({ view }: { view: RoadmapView }) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const { overview, linkState, roadmap, milestoneDays } = view;
  const pct = overview.itemCount === 0 ? 0 : Math.round((overview.doneCount / overview.itemCount) * 100);
  const hoursKnown = view.hoursDoneMinutes !== null;
  const plan = overview.plannedMinutesToDate === null ? null : t('overview.hoursPlan', { plan: f.hoursShort(overview.plannedMinutesToDate) });
  const editTo = `/roadmaps/${roadmap.id}/edit?focus=goal`;
  let hoursSub: ReactNode;
  if (linkState === 'none' || linkState === 'missing') {
    hoursSub = (
      <>
        {t(linkState === 'none' ? 'overview.hoursNone' : 'overview.hoursMissing')}{' '}
        <Link to={editTo} data-testid="overview-link-goal">
          {t('overview.linkGoal')}
        </Link>
      </>
    );
  } else if (linkState === 'archived') {
    hoursSub = plan ? `${t('overview.hoursArchived')} ${plan}` : t('overview.hoursArchived');
  } else {
    hoursSub = plan;
  }
  const showMilestone = roadmap.milestoneDate !== null && milestoneDays !== null;
  return (
    <section className="rd-sec" aria-labelledby="rd-ov-h" data-testid="overview">
      <h2 className="eyebrow" id="rd-ov-h">
        {t('overview.label')}
      </h2>
      <div className={showMilestone ? 'rd-ov' : 'rd-ov three'}>
        <div className="rd-m" data-testid="metric-pace">
          <div className="eyebrow">{t('overview.pace')}</div>
          <PaceChip pace={overview.pace} />
          <div className="rd-s" data-testid="pace-sub">
            {paceSub(t, view, f.dateShort)}
          </div>
        </div>
        <div className="rd-m" data-testid="metric-done">
          <div className="eyebrow">{t(overview.weekBased ? 'overview.doneWeeks' : 'overview.doneItems')}</div>
          <div className="rd-v num" data-testid="done-value">
            {t('overview.doneValue', { done: f.number(overview.doneCount), total: f.number(overview.itemCount) })}
          </div>
          <div className="rd-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rd-m" data-testid="metric-hours">
          <div className="eyebrow">{t('overview.hours')}</div>
          <div className={hoursKnown ? 'rd-v num' : 'rd-v txt'} data-testid="hours-value">
            {hoursKnown ? f.hoursShort(view.hoursDoneMinutes!) : t('noValue')}
          </div>
          {hoursSub ? (
            <div className="rd-s" data-testid="hours-sub">
              {hoursSub}
            </div>
          ) : null}
        </div>
        {showMilestone ? (
          <div className="rd-m" data-testid="metric-milestone">
            <div className="eyebrow">{roadmap.milestoneLabel || t('milestone.defaultLabel')}</div>
            <div className={milestoneDays > 0 ? 'rd-v num' : 'rd-v txt'} data-testid="milestone-value">
              {milestoneDays > 0 ? (
                <>
                  {f.number(milestoneDays)} <small>{t('milestone.unit', { count: milestoneDays })}</small>
                </>
              ) : (
                t(milestoneDays === 0 ? 'milestone.todayValue' : 'milestone.pastValue')
              )}
            </div>
            <div className="rd-s num">{t('milestone.date', { date: f.dateShort(roadmap.milestoneDate!) })}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
