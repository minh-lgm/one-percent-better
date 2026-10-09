import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toISODate } from '../../domain/dates';
import { dailyTarget, goalStatus } from '../../domain/goal';
import type { Goal, GoalStatus } from '../../domain/types';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { HistoryTable } from '../components/HistoryTable';
import { Skeleton } from '../components/Skeleton';
import { useDelayed } from '../hooks/useDelayed';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import { NotFound } from './NotFound';

const TONES: Record<GoalStatus, BadgeTone> = { active: 'success', upcoming: 'info', ended: 'neutral', archived: 'neutral' };

interface PendingDelete {
  entryCount: number;
  timerRunning: boolean;
  opener: HTMLElement | null;
}

/** S4 — Goal detail `#/goals/:id`, M3 scope: header, info, Edit/Delete, History (FR-18). */
export function GoalDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { goalService } = useServices();
  const goals = useSubscribable(() => goalService.watchAll(), [goalService]);
  const goal = goals.data?.find((g) => g.id === id);
  const showSkeleton = useDelayed(goals.loading);

  if (goals.loading) return showSkeleton ? <Skeleton /> : null;
  if (!goal) return <NotFound variant="goal" />;
  return <GoalDetailView key={goal.id} goal={goal} />;
}

function GoalDetailView({ goal }: { goal: Goal }) {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { goalService, entryService, timerService } = useServices();
  const today = toISODate(useNow());
  const status = goalStatus(goal, today);
  useDocumentTitle(goal.name);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const entries = useSubscribable(() => entryService.watchByGoal(goal.id), [entryService, goal.id]);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      const r = await goalService.remove(goal.id);
      if (r.ok) {
        toast.show('toast.goalDeleted');
        setPending(null);
        void navigate('/goals');
      }
    } finally {
      setBusy(false);
    }
  }

  const range = f.dateRange(goal.startDate, goal.endDate);
  const info =
    goal.targetType === 'daily'
      ? t('goals.rowDaily', { n: f.number(goal.targetMinutes), range })
      : t('goals.rowTotal', { daily: f.number(dailyTarget(goal)), hours: f.number(goal.targetMinutes / 60), range });

  const deleteBody = pending ? (pending.entryCount === 0 ? t('goal.delete.bodyNoEntries') : t('goal.delete.body', { count: pending.entryCount })) : '';

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
            <Badge tone={TONES[status]}>{t(`goal.status.${status === 'archived' ? 'ended' : status}`)}</Badge>
          </div>
          {goal.why ? <p className="why">{goal.why}</p> : null}
          <p className="muted small num">{info}</p>
        </div>
        <div className="gd-actions">
          <LinkButton variant="secondary" to={`/goals/${goal.id}/edit`}>
            {t('common.edit')}
          </LinkButton>
          <Button variant="danger-ghost" onClick={(e) => void openDelete(e.currentTarget)}>
            {t('common.delete')}
          </Button>
        </div>
      </header>

      <section className="card section" aria-labelledby="hist-h">
        <h2 id="hist-h">{t('goal.detail.historyTitle')}</h2>
        {entries.loading ? null : entries.data && entries.data.length > 0 ? (
          <HistoryTable entries={entries.data} />
        ) : (
          <EmptyState compact heading="h3" title={t('empty.detail.history')} body={t('empty.detail.historyBody')} />
        )}
      </section>

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
