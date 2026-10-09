import { useId, useRef, useState } from 'react';
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
  timer?: GoalTimerState;
  onAdd: (values: EntryFormValues) => Promise<EntrySubmitResult>;
  onUpdate: (entry: LogEntry, values: EntryFormValues) => Promise<EntrySubmitResult>;
  onDelete: (entry: LogEntry) => Promise<void>;
  onStartTimer?: () => Promise<StartTimerResult>;
}

/** Today card for one active goal (DESIGN S1): amount, progress, +1%, inline entry form, entries, timer start. */
export function GoalCard({ goal, target, minutes, entries, timer = 'none', onAdd, onUpdate, onDelete, onStartTimer }: GoalCardProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [timerError, setTimerError] = useState<DomainError | null>(null);
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const met = minutes >= target;
  const hours = goal.targetType === 'total' ? f.number(goal.targetMinutes / 60) : null;

  const focusLogButton = () => requestAnimationFrame(() => logButtonRef.current?.focus());

  const status = met
    ? minutes > target
      ? t('goalCard.reachedExtra', { n: f.number(minutes - target) })
      : t('goalCard.reached')
    : t('goalCard.toGo', { n: f.number(target - minutes) });

  async function startTimer() {
    if (timer !== 'none' || !onStartTimer) return;
    setTimerError(null);
    const r = await onStartTimer();
    if (!r.ok) setTimerError(r.errors[0] ?? null);
  }

  const timerErrorText = timerError ? (({ key, params }) => t(key, params))(errorMessage(timerError, f)) : null;

  return (
    <li>
      <article className="card goal" aria-labelledby={`${id}-name`}>
        <div className="row">
          <h2 id={`${id}-name`}>{goal.name}</h2>
          {met ? <PlusOnePill /> : null}
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
          label={t('goalCard.progressLabel', { goal: goal.name })}
          valueText={t('goalCard.progressValue', { current: f.number(minutes), target: f.number(target) })}
        />
        <p className="muted small status">{status}</p>
        <div className="actions">
          <Button
            ref={logButtonRef}
            variant={met ? 'secondary' : 'primary'}
            aria-expanded={formOpen}
            aria-controls={`${id}-form`}
            onClick={() => {
              setEditingId(null);
              setFormOpen((v) => !v);
            }}
          >
            {t('goalCard.logTime')}
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
              label={t('entry.form.labelAdd', { goal: goal.name })}
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
            <h3 className="entries-title">{t('entry.listTitle')}</h3>
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
