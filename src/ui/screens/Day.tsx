import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { isValidISODate, toISODate } from '../../domain/dates';
import { minutesByGoal } from '../../domain/entry';
import { byCreatedAt, dailyTarget, isWithinGoal } from '../../domain/goal';
import type { DomainError, LogEntry } from '../../domain/types';
import { Alert } from '../components/Alert';
import { LinkButton } from '../components/Button';
import { DateNav } from '../components/DateNav';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { EntryFormValues, EntrySubmitResult } from '../components/EntryForm';
import { GoalCard } from '../components/GoalCard';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

/** S5 — Day `#/day/:date`: view, back-fill or edit entries of one day (FR-17). */
export function Day() {
  const { date = '' } = useParams<{ date: string }>();
  const today = toISODate(useNow());
  const valid = isValidISODate(date);

  if (!valid) return <InvalidDay />;
  if (date > today) return <FutureDay date={date} today={today} />;
  return <DayView date={date} today={today} />;
}

/** `#/day/abc`, `#/day/2026-13-40`: error screen with a way back (DESIGN S5). */
function InvalidDay() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('day.title')} />
      <div className="empty card" data-testid="day-invalid">
        <Icon name="alert" />
        <h2>{t('day.invalid')}</h2>
        <LinkButton variant="primary" to="/today">
          {t('day.invalidAction')}
        </LinkButton>
      </div>
    </>
  );
}

function useDayNavigation() {
  const navigate = useNavigate();
  return (next: string) => navigate(`/day/${next}`);
}

function FutureDay({ date, today }: { date: string; today: string }) {
  const { t } = useT();
  const f = useFormat();
  const go = useDayNavigation();
  return (
    <>
      <PageHeader title={t('day.title')} actions={<GoToToday />} />
      <DateNav date={date} today={today} onChange={go} />
      <p className="date-title num">{f.dateLong(date, { withYear: true })}</p>
      <Alert role="status">{t('errors.DATE_IN_FUTURE')}</Alert>
    </>
  );
}

function GoToToday() {
  const { t } = useT();
  return (
    <LinkButton variant="ghost" to="/today">
      {t('day.goToToday')}
    </LinkButton>
  );
}

function DayView({ date, today }: { date: string; today: string }) {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const go = useDayNavigation();
  const { goalService, entryService } = useServices();

  const [attempt, setAttempt] = useState(0);
  const goals = useSubscribable(() => goalService.watchAll(), [goalService, attempt]);
  const entries = useSubscribable(() => entryService.watchByDateRange(date, date), [entryService, date, attempt]);
  const loading = goals.loading || entries.loading;
  const showSkeleton = useDelayed(loading);

  // Every goal whose period contains the day, whatever its status today (ended/archived included);
  // an open-ended goal is present on every day from its start (v4.0, the future is blocked above).
  const running = (goals.data ?? []).filter((g) => isWithinGoal(date, g)).sort(byCreatedAt);
  const dayEntries = entries.data ?? [];
  const byGoal = minutesByGoal(dayEntries);

  const toResult = (r: { ok: true; value: unknown } | { ok: false; errors: DomainError[] }): EntrySubmitResult =>
    r.ok ? { ok: true } : { ok: false, errors: r.errors };

  async function addEntry(goalId: string, values: EntryFormValues): Promise<EntrySubmitResult> {
    try {
      const r = await entryService.add({ goalId, date, minutes: values.minutes, note: values.note, source: 'manual' }, new Date());
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
      <PageHeader title={t('day.title')} actions={<GoToToday />} />
      <DateNav date={date} today={today} onChange={go} />
      <p className="date-title num">{f.dateLong(date, { withYear: true })}</p>
      <p className="muted small day-note">{t('day.onlyRunning')}</p>
      {goals.error || entries.error ? (
        <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />
      ) : loading ? (
        showSkeleton ? <Skeleton /> : null
      ) : running.length === 0 ? (
        <EmptyState title={t('empty.day.noGoals')} body={t('empty.day.noGoalsBody')} actionLabel={t('empty.day.noGoalsAction')} actionTo="/goals" />
      ) : (
        <ul className="stack" aria-label={t('day.goalsLabel')}>
          {running.map((goal) => (
            <GoalCard
              key={goal.id}
              variant="day"
              date={date}
              goal={goal}
              target={dailyTarget(goal)}
              minutes={byGoal.get(goal.id) ?? 0}
              entries={dayEntries.filter((e) => e.goalId === goal.id).sort(byCreatedAt)}
              onAdd={(values) => addEntry(goal.id, values)}
              onUpdate={updateEntry}
              onDelete={deleteEntry}
            />
          ))}
        </ul>
      )}
    </>
  );
}
