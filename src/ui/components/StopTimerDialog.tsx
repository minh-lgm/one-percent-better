import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ENTRY_NOTE_MAX } from '../../config/constants';
import { splitMinSec, type TimerPreview } from '../../domain/timer';
import type { DomainError } from '../../domain/types';
import { errorMessage, WRITE_FAILED_KEY } from '../error-messages';
import { parseDecimalInput } from '../number-input';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Alert } from './Alert';
import { Button } from './Button';
import type { EntryFormValues, EntrySubmitResult } from './EntryForm';
import { TextField } from './Field';

export interface StopTimerDialogProps {
  goalName: string;
  preview: TimerPreview;
  onSave: (values: EntryFormValues) => Promise<EntrySubmitResult>;
  onKeepRunning: () => void;
  onDiscard: () => Promise<void> | void;
}

/**
 * D1 — "Save this session?" (DESIGN §4 S1, mockup 04). Native `<dialog>` opened on
 * mount (mount it only while it should be open); Esc = Keep running.
 */
export function StopTimerDialog({ goalName, preview, onSave, onKeepRunning, onDiscard }: StopTimerDialogProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [minutes, setMinutes] = useState(() => String(preview.minutes));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [writeFailed, setWriteFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    minutesRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onKeepRunning();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onKeepRunning]);

  const fieldError = (field: string) => {
    const err = errors.find((e) => e.field === field);
    if (!err) return undefined;
    const m = errorMessage(err, f);
    return t(m.key, m.params);
  };
  const otherErrors = errors.filter((e) => e.field !== 'minutes' && e.field !== 'note');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setWriteFailed(false);
    try {
      const result = await onSave({ minutes: parseDecimalInput(minutes), note });
      if (result.ok) return;
      if ('writeFailed' in result) {
        setWriteFailed(true);
        return;
      }
      setErrors(result.errors);
      const first = result.errors[0]?.field;
      (first === 'note' ? noteRef : minutesRef).current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    if (busy) return;
    setBusy(true);
    try {
      await onDiscard();
    } finally {
      setBusy(false);
    }
  }

  const raw = splitMinSec(preview.elapsedMs);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`} data-testid="stop-dialog">
      <form onSubmit={handleSubmit} noValidate>
        <h2 id={`${id}-title`}>{t('timer.dialogTitle')}</h2>
        <p id={`${id}-summary`} className="dialog-summary">
          {t('timer.dialogSummary', { goal: goalName, elapsed: f.hhmmss(preview.elapsedMs) })}
        </p>
        <TextField
          id={`${id}-minutes`}
          label={t('entry.form.minutesLabel')}
          inputRef={minutesRef}
          className="num"
          inputMode="numeric"
          autoComplete="off"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          hint={t('timer.roundedHint', { raw: t('format.minSec', { m: raw.m, s: raw.s }) })}
          error={fieldError('minutes')}
          required
        />
        <TextField
          id={`${id}-note`}
          label={t('entry.form.noteLabel')}
          inputRef={noteRef}
          autoComplete="off"
          placeholder={t('entry.form.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          counter={t('entry.form.counter', { n: note.length })}
          maxLength={ENTRY_NOTE_MAX + 50}
          error={fieldError('note')}
        />
        <p className="hint">{t('timer.savedTo', { date: f.dateLong(preview.date) })}</p>
        {otherErrors.map((err) => {
          const m = errorMessage(err, f);
          return <Alert key={err.code}>{t(m.key, m.params)}</Alert>;
        })}
        {writeFailed ? <Alert>{t(WRITE_FAILED_KEY)}</Alert> : null}
        <div className="actions">
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined}>
            {busy ? t('common.saving') : t('entry.form.save')}
          </Button>
          <Button variant="secondary" onClick={onKeepRunning} disabled={busy}>
            {t('timer.keepRunning')}
          </Button>
          <Button variant="danger-ghost" onClick={() => void handleDiscard()} disabled={busy}>
            {t('timer.discard')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
