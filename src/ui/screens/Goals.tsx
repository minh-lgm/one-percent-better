import { useCallback, useState } from 'react';
import { toISODate } from '../../domain/dates';
import { dailyTarget, goalStatus, groupGoals } from '../../domain/goal';
import type { Goal, GoalStatus } from '../../domain/types';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

const TONES: Record<GoalStatus, BadgeTone> = { active: 'success', upcoming: 'info', ended: 'neutral', archived: 'neutral' };

interface PendingDelete {
  goal: Goal;
  entryCount: number;
  /** True when the running timer belongs to this goal (it will be discarded). */
  timerRunning: boolean;
  opener: HTMLElement | null;
}

export function Goals() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const { goalService, timerService } = useServices();
  const today = toISODate(useNow());
  const goals = useSubscribable(() => goalService.watchAll(), [goalService]);
  const showSkeleton = useDelayed(goals.loading);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);

  const closeDialog = useCallback(() => {
    const opener = pending?.opener;
    setPending(null);
    requestAnimationFrame(() => opener?.focus());
  }, [pending]);

  async function openDelete(goal: Goal, opener: HTMLElement) {
    const [entryCount, timer] = await Promise.all([goalService.entryCount(goal.id), timerService.current()]);
    setPending({ goal, entryCount, timerRunning: timer?.goalId === goal.id, opener });
  }

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await goalService.remove(pending.goal.id);
      if (r.ok) toast.show('toast.goalDeleted');
    } finally {
      setBusy(false);
      setPending(null);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
    }
  }

  const groups = goals.data ? groupGoals(goals.data, today) : null;
  type Section = { status: GoalStatus; titleKey: 'goals.groupActive' | 'goals.groupUpcoming' | 'goals.groupEnded'; items: Goal[] };
  const allSections: Section[] = groups
    ? [
        { status: 'active', titleKey: 'goals.groupActive', items: groups.active },
        { status: 'upcoming', titleKey: 'goals.groupUpcoming', items: groups.upcoming },
        { status: 'ended', titleKey: 'goals.groupEnded', items: groups.ended },
      ]
    : [];
  const sections = allSections.filter((s) => s.items.length > 0);

  function rowLine(goal: Goal): string {
    const range = f.dateRange(goal.startDate, goal.endDate);
    if (goal.targetType === 'daily') return t('goals.rowDaily', { n: f.number(goal.targetMinutes), range });
    return t('goals.rowTotal', { daily: f.number(dailyTarget(goal)), hours: f.number(goal.targetMinutes / 60), range });
  }

  const deleteBody = pending
    ? pending.entryCount === 0
      ? t('goal.delete.bodyNoEntries')
      : t('goal.delete.body', { count: pending.entryCount })
    : '';

  return (
    <>
      <PageHeader
        title={t('goals.title')}
        actions={
          <LinkButton variant="primary" to="/goals/new" icon="plus">
            {t('goals.new')}
          </LinkButton>
        }
      />
      {goals.loading ? (
        showSkeleton ? <Skeleton blocks={3} /> : null
      ) : goals.data && goals.data.length === 0 ? (
        <EmptyState title={t('empty.goals')} body={t('empty.goalsBody')} actionLabel={t('empty.goalsAction')} actionTo="/goals/new" />
      ) : (
        sections.map((section) => (
          <section key={section.status} className="group" aria-labelledby={`group-${section.status}`}>
            <h2 id={`group-${section.status}`}>{t(section.titleKey, { n: f.number(section.items.length) })}</h2>
            <ul className="stack">
              {section.items.map((goal) => {
                const status = goalStatus(goal, today);
                return (
                  <li key={goal.id} className="card goal-row" data-testid="goal-row">
                    <div className="goal-info">
                      <div className="top">
                        <h3>{goal.name}</h3>
                        <Badge tone={TONES[status]}>{t(`goal.status.${status === 'archived' ? 'ended' : status}`)}</Badge>
                      </div>
                      <p className="muted small num">{rowLine(goal)}</p>
                      {status === 'upcoming' ? <p className="muted small num">{t('goals.startsOn', { date: f.dateShort(goal.startDate) })}</p> : null}
                      {status === 'ended' ? <p className="muted small num">{t('goals.endedOn', { date: f.dateShort(goal.endDate) })}</p> : null}
                      {goal.why ? <p className="muted small why">{goal.why}</p> : null}
                    </div>
                    <div className="gr-actions">
                      <LinkButton variant="secondary" to={`/goals/${goal.id}/edit`}>
                        {t('common.edit')}
                      </LinkButton>
                      <Button variant="danger-ghost" onClick={(e) => void openDelete(goal, e.currentTarget)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending ? t('goal.delete.title', { name: pending.goal.name }) : ''}
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
