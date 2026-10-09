import { toISODate } from '../../domain/dates';
import { minutesByGoal } from '../../domain/entry';
import { activeGoals, dailyTarget } from '../../domain/goal';
import type { LogEntry } from '../../domain/types';
import { EmptyState } from '../components/EmptyState';
import type { EntryFormValues, EntrySubmitResult } from '../components/EntryForm';
import { GoalCard } from '../components/GoalCard';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

export function Today() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const { goalService, entryService } = useServices();
  const now = useNow();
  const today = toISODate(now);

  const goals = useSubscribable(() => goalService.watchAll(), [goalService]);
  const entries = useSubscribable(() => entryService.watchByDateRange(today, today), [entryService, today]);
  const loading = goals.loading || entries.loading;
  const showSkeleton = useDelayed(loading);

  const allGoals = goals.data ?? [];
  const active = activeGoals(allGoals, today);
  const todayEntries = entries.data ?? [];
  const byGoal = minutesByGoal(todayEntries);
  const onTarget = active.filter((g) => (byGoal.get(g.id) ?? 0) >= dailyTarget(g)).length;

  const summary =
    active.length === 0 ? null : onTarget === active.length ? t('today.allOnTarget', { count: active.length }) : t('today.summary', { n: onTarget, count: active.length });

  const toResult = (r: { ok: true; value: unknown } | { ok: false; errors: import('../../domain/types').DomainError[] }): EntrySubmitResult =>
    r.ok ? { ok: true } : { ok: false, errors: r.errors };

  async function addEntry(goalId: string, values: EntryFormValues): Promise<EntrySubmitResult> {
    try {
      const r = await entryService.add({ goalId, date: today, minutes: values.minutes, note: values.note, source: 'manual' }, new Date());
      if (r.ok) toast.show('toast.entrySaved');
      return toResult(r);
    } catch {
      return { ok: false, writeFailed: true };
    }
  }

  async function updateEntry(entry: LogEntry, values: EntryFormValues): Promise<EntrySubmitResult> {
    try {
      const r = await entryService.update(entry.id, values, new Date());
      if (r.ok) toast.show('toast.entryUpdated');
      return toResult(r);
    } catch {
      return { ok: false, writeFailed: true };
    }
  }

  async function deleteEntry(entry: LogEntry): Promise<void> {
    const r = await entryService.remove(entry.id);
    if (r.ok) toast.show('toast.entryDeleted');
  }

  return (
    <>
      <PageHeader title={t('today.title')} subtitle={f.dateLong(today)} />
      {loading ? (
        showSkeleton ? <Skeleton /> : null
      ) : allGoals.length === 0 ? (
        <EmptyState title={t('empty.today.noGoals')} body={t('empty.today.noGoalsBody')} actionLabel={t('empty.today.noGoalsAction')} actionTo="/goals/new" />
      ) : active.length === 0 ? (
        <EmptyState title={t('empty.today.noActive')} body={t('empty.today.noActiveBody')} actionLabel={t('empty.today.noActiveAction')} actionTo="/goals" />
      ) : (
        <>
          <p className="summary" aria-live="polite">
            {summary}
          </p>
          <ul className="stack" aria-label={t('today.goalsLabel')}>
            {active.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                target={dailyTarget(goal)}
                minutes={byGoal.get(goal.id) ?? 0}
                entries={todayEntries.filter((e) => e.goalId === goal.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))}
                onAdd={(values) => addEntry(goal.id, values)}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
