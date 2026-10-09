import { useCallback, useEffect, useState } from 'react';
import { toISODate } from '../../domain/dates';
import { minutesByGoal } from '../../domain/entry';
import { activeGoals, dailyTarget } from '../../domain/goal';
import { reminderData, shouldShowBanner, type GoalProgress } from '../../domain/reminder';
import type { TimerPreview } from '../../domain/timer';
import type { ActiveTimer, DomainError, LogEntry } from '../../domain/types';
import { EmptyState } from '../components/EmptyState';
import type { EntryFormValues, EntrySubmitResult } from '../components/EntryForm';
import { GoalCard, type GoalTimerState, type StartTimerResult } from '../components/GoalCard';
import { PageHeader } from '../components/PageHeader';
import { ReminderBanner } from '../components/ReminderBanner';
import { Skeleton } from '../components/Skeleton';
import { StopTimerDialog } from '../components/StopTimerDialog';
import { TimerCard } from '../components/TimerCard';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

interface StopState {
  preview: TimerPreview;
  opener: HTMLElement | null;
}

const focusHeading = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());

export function Today() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const { goalService, entryService, timerService, settingsService } = useServices();
  const now = useNow();
  const today = toISODate(now);

  const goals = useSubscribable(() => goalService.watchAll(), [goalService]);
  const entries = useSubscribable(() => entryService.watchByDateRange(today, today), [entryService, today]);
  const timer = useSubscribable(() => timerService.watch(), [timerService]);
  const settings = useSubscribable(() => settingsService.watch(), [settingsService]);
  const loading = goals.loading || entries.loading || timer.loading || settings.loading;
  const showSkeleton = useDelayed(loading);
  const [stop, setStop] = useState<StopState | null>(null);
  // Timer returned by a successful `start`, shown until the live query catches up (M2-D4).
  const [pendingTimer, setPendingTimer] = useState<ActiveTimer | null>(null);
  useEffect(() => {
    setPendingTimer(null);
  }, [timer.data]);

  const allGoals = goals.data ?? [];
  const active = activeGoals(allGoals, today);
  const todayEntries = entries.data ?? [];
  const byGoal = minutesByGoal(todayEntries);
  const onTarget = active.filter((g) => (byGoal.get(g.id) ?? 0) >= dailyTarget(g)).length;

  const activeTimer = timer.data ?? pendingTimer ?? undefined;
  const timerGoal = activeTimer ? allGoals.find((g) => g.id === activeTimer.goalId) : undefined;
  const timerRunning = Boolean(activeTimer && timerGoal);

  const progress: GoalProgress[] = active.map((g) => ({ id: g.id, name: g.name, current: byGoal.get(g.id) ?? 0, target: dailyTarget(g) }));
  const banner = settings.data && shouldShowBanner(now, settings.data, progress) ? reminderData(progress) : null;

  const summary =
    active.length === 0 ? null : onTarget === active.length ? t('today.allOnTarget', { count: active.length }) : t('today.summary', { n: onTarget, count: active.length });

  const toResult = (r: { ok: true; value: unknown } | { ok: false; errors: DomainError[] }): EntrySubmitResult =>
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

  async function startTimer(goalId: string): Promise<StartTimerResult> {
    const r = await timerService.start(goalId, new Date());
    if (r.ok) setPendingTimer(r.value);
    return r.ok ? { ok: true } : { ok: false, errors: r.errors };
  }

  async function openStop(opener: HTMLElement) {
    const r = await timerService.stop(new Date());
    if (r.ok) setStop({ preview: r.value, opener });
  }

  const keepRunning = useCallback(() => {
    const opener = stop?.opener;
    setStop(null);
    requestAnimationFrame(() => opener?.focus());
  }, [stop]);

  async function saveTimer(values: EntryFormValues): Promise<EntrySubmitResult> {
    try {
      const r = await timerService.save(values, new Date());
      if (r.ok) {
        toast.show('toast.entrySaved');
        setStop(null);
        focusHeading();
      }
      return toResult(r);
    } catch {
      return { ok: false, writeFailed: true };
    }
  }

  async function discardTimer() {
    const r = await timerService.discard();
    if (r.ok) toast.show('toast.timerDiscarded');
    setStop(null);
    focusHeading();
  }

  const timerStateFor = (goalId: string): GoalTimerState => (!timerRunning ? 'none' : activeTimer?.goalId === goalId ? 'running' : 'other');

  return (
    <>
      <PageHeader title={t('today.title')} subtitle={f.dateLong(today)} />
      {loading ? (
        showSkeleton ? <Skeleton /> : null
      ) : allGoals.length === 0 ? (
        <EmptyState title={t('empty.today.noGoals')} body={t('empty.today.noGoalsBody')} actionLabel={t('empty.today.noGoalsAction')} actionTo="/goals/new" />
      ) : active.length === 0 && !timerRunning ? (
        <EmptyState title={t('empty.today.noActive')} body={t('empty.today.noActiveBody')} actionLabel={t('empty.today.noActiveAction')} actionTo="/goals" />
      ) : (
        <>
          {summary ? (
            <p className="summary" aria-live="polite">
              {summary}
            </p>
          ) : null}
          {banner ? <ReminderBanner count={banner.count} time={settings.data?.reminderTime ?? ''} /> : null}
          {activeTimer && timerGoal ? <TimerCard goal={timerGoal} startedAt={activeTimer.startedAt} onStop={(opener) => void openStop(opener)} /> : null}
          <ul className="stack" aria-label={t('today.goalsLabel')}>
            {active.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                target={dailyTarget(goal)}
                minutes={byGoal.get(goal.id) ?? 0}
                entries={todayEntries.filter((e) => e.goalId === goal.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))}
                timer={timerStateFor(goal.id)}
                onAdd={(values) => addEntry(goal.id, values)}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                onStartTimer={() => startTimer(goal.id)}
              />
            ))}
          </ul>
        </>
      )}
      {stop ? (
        <StopTimerDialog goalName={timerGoal?.name ?? ''} preview={stop.preview} onSave={saveTimer} onKeepRunning={keepRunning} onDiscard={discardTimer} />
      ) : null}
    </>
  );
}
