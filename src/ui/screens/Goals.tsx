import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { toISODate } from '../../domain/dates';
import { dailyTarget, goalStatus, groupGoals } from '../../domain/goal';
import type { DomainError, Goal, GoalStatus } from '../../domain/types';
import { Alert } from '../components/Alert';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { errorMessage } from '../error-messages';
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

interface ArchiveError {
  goalId: string;
  error: DomainError | 'write';
}

type GroupKey = 'goals.groupActive' | 'goals.groupUpcoming' | 'goals.groupEnded' | 'goals.groupArchived';

/** S2 — Goals: groups Active / Upcoming / Ended / Archived, Edit, Archive/Restore, Delete (FR-04, FR-30). */
export function Goals() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const { goalService, timerService } = useServices();
  const today = toISODate(useNow());
  const [attempt, setAttempt] = useState(0);
  const goals = useSubscribable(() => goalService.watchAll(), [goalService, attempt]);
  const showSkeleton = useDelayed(goals.loading);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<ArchiveError | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

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

  async function toggleArchive(goal: Goal) {
    if (archivingId) return;
    setArchivingId(goal.id);
    setArchiveError(null);
    try {
      const r = await goalService.setArchived(goal.id, !goal.archived, new Date());
      if (r.ok) toast.show(goal.archived ? 'toast.goalRestored' : 'toast.goalArchived');
      else setArchiveError({ goalId: goal.id, error: r.errors[0] ?? 'write' });
    } catch {
      setArchiveError({ goalId: goal.id, error: 'write' });
    } finally {
      setArchivingId(null);
    }
  }

  const groups = goals.data ? groupGoals(goals.data, today) : null;
  const allSections: Array<{ status: GoalStatus; titleKey: GroupKey; items: Goal[] }> = groups
    ? [
        { status: 'active', titleKey: 'goals.groupActive', items: groups.active },
        { status: 'upcoming', titleKey: 'goals.groupUpcoming', items: groups.upcoming },
        { status: 'ended', titleKey: 'goals.groupEnded', items: groups.ended },
        { status: 'archived', titleKey: 'goals.groupArchived', items: groups.archived },
      ]
    : [];
  const sections = allSections.filter((s) => s.items.length > 0);

  function rowLine(goal: Goal): string {
    const range = f.dateRange(goal.startDate, goal.endDate);
    if (goal.targetType === 'daily') return t('goals.rowDaily', { n: f.number(goal.targetMinutes), range });
    return t('goals.rowTotal', { daily: f.number(dailyTarget(goal)), hours: f.number(goal.targetMinutes / 60), range });
  }

  const archiveErrorText = (goalId: string): string | null => {
    if (!archiveError || archiveError.goalId !== goalId) return null;
    if (archiveError.error === 'write') return t('errors.WRITE_FAILED');
    const { key, params } = errorMessage(archiveError.error, f);
    return t(key, params);
  };

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
      {goals.error ? (
        <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />
      ) : goals.loading ? (
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
                const alert = archiveErrorText(goal.id);
                return (
                  <li key={goal.id} className="card goal-row" data-testid="goal-row">
                    <div className="goal-info">
                      <div className="top">
                        <h3>
                          <Link to={`/goals/${goal.id}`}>{goal.name}</Link>
                        </h3>
                        <Badge tone={TONES[status]}>{t(`goal.status.${status}`)}</Badge>
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
                      <Button
                        variant="secondary"
                        icon={goal.archived ? 'restore' : 'archive'}
                        disabled={archivingId === goal.id}
                        aria-busy={archivingId === goal.id || undefined}
                        onClick={() => void toggleArchive(goal)}
                      >
                        {goal.archived ? t('goals.restore') : t('goals.archive')}
                      </Button>
                      <Button variant="danger-ghost" onClick={(e) => void openDelete(goal, e.currentTarget)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                    {alert ? (
                      <div className="goal-alert">
                        <Alert>{alert}</Alert>
                      </div>
                    ) : null}
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
