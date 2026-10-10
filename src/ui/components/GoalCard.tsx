import { useEffect, useId, useRef, useState } from 'react';
import type { DomainError, Goal, LogEntry } from '../../domain/types';
import { errorMessage } from '../error-messages';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { Button } from './Button';
import { EntryForm, type EntryFormValues, type EntrySubmitResult } from './EntryForm';
import { EntryRow } from './EntryRow';
import { PlusOnePill } from './PlusOnePill';
import { ProgressBar } from './ProgressBar';

/** `running`: this goal's timer runs; `other`: another goal's timer runs (Start disabled). */
export type GoalTimerState = 'none' | 'running' | 'other';

export type StartTimerResult = { ok: true } | { ok: false; errors: DomainError[] };

export interface GoalCardProps {
  goal: Goal;
  target: number;
  minutes: number;
  entries: LogEntry[];
  /** `today` (default) or `day` (M3: past-day card, `date` required, no timer, source badges). */
  variant?: 'today' | 'day';
  /** ISO date of the day shown (Day variant). */
  date?: string;
  timer?: GoalTimerState;
  onAdd: (values: EntryFormValues) => Promise<EntrySubmitResult>;
  onUpdate: (entry: LogEntry, values: EntryFormValues) => Promise<EntrySubmitResult>;
  onDelete: (entry: LogEntry) => Promise<void>;
  onStartTimer?: () => Promise<StartTimerResult>;
  /** Play the one-time "+1%" effect (Today, FR-29). */
  plusOneAnimate?: boolean;
}

/** Today/Day card for one goal (DESIGN S1, S5): amount, progress, +1%, inline entry form, entries, timer start. */
export function GoalCard({ goal, target, minutes, entries, variant = 'today', date = '', timer = 'none', onAdd, onUpdate, onDelete, onStartTimer, plusOneAnimate = false }: GoalCardProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [timerError, setTimerError] = useState<DomainError | null>(null);
  // Set on the first Start click; released only once `timer` reflects a running
  // timer (or the start failed). A second click in between is a no-op (M2-D4).
  const starting = useRef(false);
  useEffect(() => {
    if (timer !== 'none') starting.current = false;
  }, [timer]);
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const met = minutes >= target;
  const isDay = variant === 'day';
  const dateText = isDay ? f.dateShort(date) : '';
  const hours = goal.targetType === 'total' ? f.number(goal.targetMinutes / 60) : null;

  const focusLogButton = () => requestAnimationFrame(() => logButtonRef.current?.focus());

  const status = met
    ? minutes > target
      ? t('goalCard.reachedExtra', { n: f.number(minutes - target) })
      : t('goalCard.reached')
    : isDay && minutes === 0
      ? t('empty.day.noEntries')
      : t('goalCard.toGo', { n: f.number(target - minutes) });

  async function startTimer() {
    if (timer !== 'none' || !onStartTimer || starting.current) return;
    starting.current = true;
    setTimerError(null);
    let ok = false;
    try {
      const r = await onStartTimer();
      ok = r.ok;
      if (!r.ok) setTimerError(r.errors[0] ?? null);
    } finally {
      // On success the guard is released by the effect above, when the parent re-renders
      // this card as `running` (Today does that right away via its optimistic timer state).
      if (!ok) starting.current = false;
    }
  }

  const timerErrorText = timerError ? (({ key, params }) => t(key, params))(errorMessage(timerError, f)) : null;

  return (
    <li>
      <article className="card goal" aria-labelledby={`${id}-name`}>
        <div className="row">
          <h2 id={`${id}-name`}>{goal.name}</h2>
          {met ? <PlusOnePill srKey={isDay ? 'goalCard.plusOneSrDay' : 'goalCard.plusOneSrToday'} animate={plusOneAnimate} /> : null}
        </div>
        {goal.targetType === 'total' && hours ? (
          <p className="muted small">{t('goalCard.subtitleTotal', { daily: f.number(target), hours })}</p>
        ) : null}
        <p className="amount num">
          {t('goalCard.amount', { current: f.number(minutes), target: f.number(target) })} <span className="unit">{t('unit.min')}</span>
        </p>
        <ProgressBar
          value={minutes}
          max={target}
          label={isDay ? t('goalCard.progressLabelDay', { goal: goal.name, date: dateText }) : t('goalCard.progressLabel', { goal: goal.name })}
          valueText={t('goalCard.progressValue', { current: f.number(minutes), target: f.number(target) })}
        />
        <p className="muted small status">{status}</p>
        <div className="actions">
          <Button
            ref={logButtonRef}
            variant={met ? 'secondary' : 'primary'}
            icon={isDay ? 'plus' : undefined}
            aria-expanded={formOpen}
            aria-controls={`${id}-form`}
            onClick={() => {
              setEditingId(null);
              setFormOpen((v) => !v);
            }}
          >
            {isDay ? t('goalCard.addEntry') : t('goalCard.logTime')}
          </Button>
          {onStartTimer ? (
            timer === 'running' ? (
              <Badge tone="success">{t('goalCard.timerRunningBadge')}</Badge>
            ) : (
              <Button
                variant="ghost"
                icon="play"
                aria-disabled={timer === 'other' ? true : undefined}
                aria-describedby={timer === 'other' ? `${id}-timer-why` : undefined}
                onClick={() => void startTimer()}
              >
                {t('goalCard.startTimer')}
              </Button>
            )
          ) : null}
        </div>
        {timer === 'other' ? (
          <p id={`${id}-timer-why`} className="hint">
            {t('goalCard.timerDisabled')}
          </p>
        ) : null}
        {timerErrorText ? <Alert>{timerErrorText}</Alert> : null}
        {formOpen ? (
          <div id={`${id}-form`}>
            <EntryForm
              mode="add"
              label={isDay ? t('entry.form.labelAddDay', { goal: goal.name, date: dateText }) : t('entry.form.labelAdd', { goal: goal.name })}
              onSubmit={async (values) => {
                const result = await onAdd(values);
                if (result.ok) {
                  setFormOpen(false);
                  focusLogButton();
                }
                return result;
              }}
              onCancel={() => {
                setFormOpen(false);
                focusLogButton();
              }}
            />
          </div>
        ) : null}
        {entries.length > 0 ? (
          <>
            {isDay ? null : <h3 className="entries-title">{t('entry.listTitle')}</h3>}
            <ul className="entries">
              {entries.map((entry) =>
                editingId === entry.id ? (
                  <li key={entry.id} className="editing">
                    <EntryForm
                      mode="edit"
                      label={t('entry.form.labelEdit', { goal: goal.name })}
                      defaultValues={{ minutes: entry.minutes, note: entry.note }}
                      onSubmit={async (values) => {
                        const result = await onUpdate(entry, values);
                        if (result.ok) {
                          setEditingId(null);
                          focusLogButton();
                        }
                        return result;
                      }}
                      onCancel={() => {
                        setEditingId(null);
                        focusLogButton();
                      }}
                    />
                  </li>
                ) : (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => {
                      setFormOpen(false);
                      setEditingId(entry.id);
                    }}
                    onDelete={() => onDelete(entry)}
                    onDeleted={focusLogButton}
                    showSource={isDay}
                  />
                ),
              )}
            </ul>
          </>
        ) : null}
      </article>
    </li>
  );
}
