import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TOAST_DURATION_MS } from '../../config/constants';
import { backupReminder } from '../../domain/backup-file';
import { addDays, toISODate } from '../../domain/dates';
import { minutesByGoal } from '../../domain/entry';
import { activeGoals, byCreatedAt, dailyTarget } from '../../domain/goal';
import { shouldShowLoginPrompt } from '../../domain/login-prompt';
import { newlyMetGoals } from '../../domain/plusone';
import { reminderData, shouldShowBanner, type GoalProgress } from '../../domain/reminder';
import type { TimerPreview } from '../../domain/timer';
import type { ActiveTimer, DomainError, ErrorCode, LogEntry } from '../../domain/types';
import { StatsService } from '../../services/stats-service';
import { Alert } from '../components/Alert';
import { BackupBanner } from '../components/BackupBanner';
import { EmptyState } from '../components/EmptyState';
import type { EntryFormValues, EntrySubmitResult } from '../components/EntryForm';
import { ErrorState } from '../components/ErrorState';
import { GoalCard, type GoalTimerState, type StartTimerResult } from '../components/GoalCard';
import { LoginPromptBanner } from '../components/LoginPromptBanner';
import { PageHeader } from '../components/PageHeader';
import { ReminderBanner } from '../components/ReminderBanner';
import { Skeleton } from '../components/Skeleton';
import { StopTimerDialog } from '../components/StopTimerDialog';
import { TimerCard } from '../components/TimerCard';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useOnline } from '../hooks/useOnline';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

interface StopState {
  preview: TimerPreview;
  /** Captured when the dialog opens, so the summary keeps the name even if the timer vanishes meanwhile (M3-D4). */
  goalName: string;
  opener: HTMLElement | null;
}

interface PlusOneFeedback {
  goalId: string;
  goalName: string;
  /** Increments on every feedback, so the same goal can re-animate on another day. */
  seq: number;
}

const focusHeading = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());

export function Today() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const { goalService, entryService, timerService, settingsService, statsService, authService, loginPromptService } = useServices();
  const now = useNow();
  const today = toISODate(now);
  const online = useOnline();

  const [attempt, setAttempt] = useState(0);
  const goals = useSubscribable(() => goalService.watchAll(), [goalService, attempt]);
  const stats = useSubscribable(() => statsService.watch(), [statsService, attempt]);
  const streak = stats.data ? StatsService.currentStreak(stats.data, today) : 0;
  const entries = useSubscribable(() => entryService.watchByDateRange(today, today), [entryService, today, attempt]);
  const timer = useSubscribable(() => timerService.watch(), [timerService, attempt]);
  const settings = useSubscribable(() => settingsService.watch(), [settingsService, attempt]);
  // Sign-in suggestion (FR-52, M8): account state + data facts + the device-only kv row.
  const auth = useSubscribable(() => authService.watch(), [authService]);
  const authKind = (auth.data ?? authService.state()).kind;
  const promptData = useSubscribable(() => loginPromptService.watchData(), [loginPromptService, attempt]);
  const promptState = useSubscribable(() => loginPromptService.watchState(), [loginPromptService, attempt]);
  const [bannerSignIn, setBannerSignIn] = useState(false);
  const loading = goals.loading || entries.loading || timer.loading || settings.loading;
  const loadError = goals.error || entries.error || timer.error || settings.error;
  const showSkeleton = useDelayed(loading);
  const [stop, setStop] = useState<StopState | null>(null);
  // Timer error that ended the Stop dialog (M3-D4): shown as an alert on the page until the next timer action.
  const [timerAlert, setTimerAlert] = useState<Extract<ErrorCode, 'TIMER_NOT_RUNNING' | 'GOAL_NOT_FOUND'> | null>(null);
  // Timer returned by a successful `start`, shown until the live query catches up (M2-D4).
  // Cleared on EVERY emission of the timer query, even a repeated `undefined` (M2-P2 / M5-AC13).
  const [pendingTimer, setPendingTimer] = useState<ActiveTimer | null>(null);
  useEffect(() => {
    setPendingTimer(null);
  }, [timer]);

  const allGoals = goals.data ?? [];
  const active = activeGoals(allGoals, today);
  const todayEntries = entries.data ?? [];
  const byGoal = minutesByGoal(todayEntries);
  const onTarget = active.filter((g) => (byGoal.get(g.id) ?? 0) >= dailyTarget(g)).length;

  const activeTimer = timer.data ?? pendingTimer ?? undefined;
  const timerGoal = activeTimer ? allGoals.find((g) => g.id === activeTimer.goalId) : undefined;
  const timerRunning = Boolean(activeTimer && timerGoal);

  // ---- "+1%" feedback, once per goal and day (FR-29, M5-T3) ----
  const metKey = active
    .filter((g) => (byGoal.get(g.id) ?? 0) >= dailyTarget(g))
    .map((g) => g.id)
    .sort()
    .join('\u0000');
  const metNow = useMemo(() => new Set(metKey ? metKey.split('\u0000') : []), [metKey]);
  const previousMet = useRef<Set<string> | null>(null);
  const [plusOne, setPlusOne] = useState<PlusOneFeedback | null>(null);
  const [plusOneCount, setPlusOneCount] = useState(0);
  const plusOneTimer = useRef<number | null>(null);
  const plusOneShown = settings.data?.plusOneShown;
  useEffect(() => {
    if (loading || !plusOneShown) return;
    const previous = previousMet.current;
    previousMet.current = metNow;
    for (const goalId of newlyMetGoals(previous, metNow, plusOneShown, today)) {
      const goal = allGoals.find((g) => g.id === goalId);
      if (!goal) continue;
      // Best effort: a failed claim (storage closed/unavailable) just means no feedback.
      settingsService
        .claimPlusOne(goalId, today)
        .then((won) => {
          if (!won) return;
          setPlusOneCount((n) => n + 1);
          setPlusOne((current) => ({ goalId, goalName: goal.name, seq: (current?.seq ?? 0) + 1 }));
          if (plusOneTimer.current !== null) window.clearTimeout(plusOneTimer.current);
          plusOneTimer.current = window.setTimeout(() => setPlusOne(null), TOAST_DURATION_MS);
        })
        .catch(() => {});
    }
    // `allGoals` only matters for the name; the set of met goals is keyed by `metNow`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metNow, plusOneShown, loading, today, settingsService]);
  useEffect(() => {
    previousMet.current = null;
  }, [today]);
  useEffect(
    () => () => {
      if (plusOneTimer.current !== null) window.clearTimeout(plusOneTimer.current);
    },
    [],
  );

  const progress: GoalProgress[] = active.map((g) => ({ id: g.id, name: g.name, current: byGoal.get(g.id) ?? 0, target: dailyTarget(g) }));
  const banner = settings.data && shouldShowBanner(now, settings.data, progress) ? reminderData(progress) : null;
  const backup = settings.data ? backupReminder(settings.data.lastBackupAt, allGoals.length, now) : null;
  // LoginPromptBanner wins over BackupBanner (DESIGN S1): never two banners about keeping data.
  const showLoginPrompt =
    !!promptData.data &&
    !!promptState.data &&
    shouldShowLoginPrompt({ now, auth: authKind, online, firstDataAt: promptData.data.firstDataAt, entryCount: promptData.data.entryCount, state: promptState.data });
  // After "Sign in with Google" on the banner the state is `signing-in` (no longer `signed-out`): keep the
  // banner, busy, until the redirect happens instead of letting it vanish under the pointer (DESIGN S1).
  const signingInFromBanner = authKind === 'signing-in' && bannerSignIn;
  const keepDataBanner = showLoginPrompt || signingInFromBanner ? (
    <LoginPromptBanner onSignIn={() => void signInFromBanner()} onNotNow={() => void notNow()} busy={signingInFromBanner} />
  ) : backup ? (
    <BackupBanner reminder={backup} withAction />
  ) : null;

  async function signInFromBanner() {
    setBannerSignIn(true);
    const r = await authService.signIn('#/today');
    if (!r.ok) setBannerSignIn(false);
  }

  async function notNow() {
    try {
      await loginPromptService.dismiss(new Date());
    } catch {
      // Storage trouble: the banner simply stays; nothing else to do here.
      return;
    }
    toast.show('loginPrompt.snoozedToast');
    // The focused "Not now" button is gone with the banner: focus the page heading (DESIGN 8.1).
    focusHeading();
  }

  const pastDayLink = (
    <p className="past-day">
      <Link to={`/day/${addDays(today, -1)}`}>{t('today.pastDayLink')}</Link>
    </p>
  );

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
    setTimerAlert(null);
    const r = await timerService.start(goalId, new Date());
    if (r.ok) setPendingTimer(r.value);
    return r.ok ? { ok: true } : { ok: false, errors: r.errors };
  }

  async function openStop(opener: HTMLElement) {
    setTimerAlert(null);
    const r = await timerService.stop(new Date());
    if (r.ok) setStop({ preview: r.value, goalName: timerGoal?.name ?? '', opener });
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
        return { ok: true };
      }
      const code = r.errors[0]?.code;
      if (code === 'TIMER_NOT_RUNNING' || code === 'GOAL_NOT_FOUND') {
        // The timer was saved/discarded in another tab, or its goal is gone (M3-D4): nothing left to
        // confirm here, so close the dialog and say why in a page-level alert.
        setTimerAlert(code);
        setStop(null);
        focusHeading();
        return { ok: true };
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
      <PageHeader
        title={t('today.title')}
        subtitle={f.dateLong(today)}
        actions={
          streak > 0 ? (
            <span className="chip num" data-testid="streak-chip">
              {t('today.streak', { n: f.number(streak) })}
            </span>
          ) : undefined
        }
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="plus-one-live" data-count={plusOneCount}>
        {plusOne ? t('plusone.live', { goal: plusOne.goalName }) : ''}
      </p>
      {loadError ? (
        <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => setAttempt((n) => n + 1)} />
      ) : loading ? (
        showSkeleton ? <Skeleton /> : null
      ) : allGoals.length === 0 ? (
        <EmptyState title={t('empty.today.noGoals')} body={t('empty.today.noGoalsBody')} actionLabel={t('empty.today.noGoalsAction')} actionTo="/goals/new" />
      ) : active.length === 0 && !timerRunning ? (
        <>
          {keepDataBanner}
          <EmptyState title={t('empty.today.noActive')} body={t('empty.today.noActiveBody')} actionLabel={t('empty.today.noActiveAction')} actionTo="/goals" />
          {pastDayLink}
        </>
      ) : (
        <>
          {summary ? (
            <p className="summary" aria-live="polite">
              {summary}
            </p>
          ) : null}
          {banner ? <ReminderBanner count={banner.count} time={settings.data?.reminderTime ?? ''} /> : null}
          {keepDataBanner}
          {timerAlert ? <Alert>{t(`errors.${timerAlert}`)}</Alert> : null}
          {activeTimer && timerGoal ? <TimerCard goal={timerGoal} startedAt={activeTimer.startedAt} onStop={(opener) => void openStop(opener)} /> : null}
          <ul className="stack" aria-label={t('today.goalsLabel')}>
            {active.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                target={dailyTarget(goal)}
                minutes={byGoal.get(goal.id) ?? 0}
                entries={todayEntries.filter((e) => e.goalId === goal.id).sort(byCreatedAt)}
                timer={timerStateFor(goal.id)}
                plusOneAnimate={plusOne?.goalId === goal.id}
                onAdd={(values) => addEntry(goal.id, values)}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                onStartTimer={() => startTimer(goal.id)}
              />
            ))}
          </ul>
          {pastDayLink}
        </>
      )}
      {stop ? (
        <StopTimerDialog goalName={stop.goalName} preview={stop.preview} onSave={saveTimer} onKeepRunning={keepRunning} onDiscard={discardTimer} />
      ) : null}
    </>
  );
}
