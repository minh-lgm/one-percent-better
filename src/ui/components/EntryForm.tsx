import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ENTRY_NOTE_MAX } from '../../config/constants';
import type { DomainError } from '../../domain/types';
import { errorMessage, WRITE_FAILED_KEY } from '../error-messages';
import { parseDecimalInput } from '../number-input';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Alert } from './Alert';
import { Button } from './Button';
import { TextField } from './Field';

export interface EntryFormValues {
  minutes: number;
  note: string;
}

export type EntrySubmitResult = { ok: true } | { ok: false; errors: DomainError[] } | { ok: false; writeFailed: true };

export interface EntryFormProps {
  mode: 'add' | 'edit';
  label: string;
  defaultValues?: { minutes: number; note: string };
  onSubmit: (values: EntryFormValues) => Promise<EntrySubmitResult>;
  onCancel: () => void;
}

/** Inline add/edit entry form (DESIGN S1). Errors are stored as codes and translated at render. */
export function EntryForm({ mode, label, defaultValues, onSubmit, onCancel }: EntryFormProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const minutesRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [minutes, setMinutes] = useState(defaultValues ? String(defaultValues.minutes) : '');
  const [note, setNote] = useState(defaultValues?.note ?? '');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    minutesRef.current?.focus();
  }, []);

  const fieldError = (field: string) => {
    const err = errors.find((e) => e.field === field);
    if (!err) return undefined;
    const m = errorMessage(err, f);
    return t(m.key, m.params);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setWriteFailed(false);
    const parsed = parseDecimalInput(minutes);
    try {
      const result = await onSubmit({ minutes: parsed, note });
      if (result.ok) return;
      if ('writeFailed' in result) {
        setWriteFailed(true);
        return;
      }
      setErrors(result.errors);
      const first = result.errors[0]?.field;
      (first === 'note' ? noteRef : minutesRef).current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <form className="entry-form" aria-label={label} onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
      <TextField
        id={`${id}-minutes`}
        label={t('entry.form.minutesLabel')}
        inputRef={minutesRef}
        className="num"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('entry.form.minutesPlaceholder')}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
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
      {writeFailed ? <Alert>{t(WRITE_FAILED_KEY)}</Alert> : null}
      <div className="actions">
        <Button type="submit" variant="primary" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('common.saving') : mode === 'add' ? t('entry.form.save') : t('entry.form.saveChanges')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
