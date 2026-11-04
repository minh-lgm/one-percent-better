// Inline checkpoint form of S14 (phase 8, M20; DESIGN v8.0 S14 `CheckpointEditor`, FR-75, A-91): name, date, maximum,
// threshold, score, note; numbers in the locale format (`7,5` in vi), errors inline per field (`max`, `range`,
// `precision`), `Save checkpoint` / `Cancel`. Lazy-only (ADR-53).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHECKPOINT_NOTE_MAX, CHECKPOINT_TITLE_MAX } from '../../../config/constants';
import type { CheckpointInput, RoadmapCheckpoint } from '../../../domain/roadmap';
import type { DomainError, Result } from '../../../domain/types';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { TextArea, TextField } from '../Field';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { parseScore, scoreInputValue } from './score';
import { useRoadmapErrors } from './useRoadmapErrors';

export interface CheckpointEditorProps {
  mode: 'add' | 'edit';
  initial: RoadmapCheckpoint | null;
  /** Default date of a new checkpoint. */
  today: string;
  labelledBy: string;
  onDirty: (dirty: boolean) => void;
  onSave: (input: CheckpointInput) => Promise<Result<RoadmapCheckpoint>>;
  onSaved: (checkpoint: RoadmapCheckpoint) => void;
  onCancel: () => void;
}

type Field = 'title' | 'date' | 'maxScore' | 'threshold' | 'score' | 'note';
const ORDER: Field[] = ['title', 'date', 'maxScore', 'threshold', 'score', 'note'];

export function CheckpointEditor({ mode, initial, today, labelledBy, onDirty, onSave, onSaved, onCancel }: CheckpointEditorProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const start = {
    title: initial?.title ?? '',
    date: initial?.date ?? today,
    maxScore: initial ? scoreInputValue(f.locale, initial.maxScore) : '',
    threshold: scoreInputValue(f.locale, initial?.threshold ?? null),
    score: scoreInputValue(f.locale, initial?.score ?? null),
    note: initial?.note ?? '',
  };
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [topError, setTopError] = useState<DomainError | 'write' | null>(null);
  const [saving, setSaving] = useState(false);
  const refs = {
    title: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    maxScore: useRef<HTMLInputElement>(null),
    threshold: useRef<HTMLInputElement>(null),
    score: useRef<HTMLInputElement>(null),
    note: useRef<HTMLTextAreaElement>(null),
  };
  useEffect(() => {
    refs.title.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount
  }, []);
  const dirty = ORDER.some((k) => values[k] !== start[k]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const set = (field: Field) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const fieldError = (field: Field) => {
    const err = errors.find((e) => e.field === field);
    return err ? errorText(err) : undefined;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTopError(null);
    const max = parseScore(values.maxScore);
    const input: CheckpointInput = {
      title: values.title,
      note: values.note,
      date: values.date,
      maxScore: max === null ? Number.NaN : max,
      threshold: parseScore(values.threshold),
      score: parseScore(values.score),
    };
    try {
      const r = await onSave(input);
      if (r.ok) {
        onSaved(r.value);
        return;
      }
      const fielded = r.errors.filter((err) => err.field !== undefined);
      setErrors(fielded);
      const other = r.errors.find((err) => err.field === undefined);
      if (other) setTopError(other);
      const first = ORDER.find((fld) => fielded.some((err) => err.field === fld));
      if (first) refs[first].current?.focus();
    } catch {
      setTopError('write');
    } finally {
      setSaving(false);
    }
  }

  const count = new Set(errors.map((err) => err.field)).size;
  const numberField = (field: 'maxScore' | 'threshold' | 'score', label: string) => (
    <TextField id={`cp-${field}`} inputRef={refs[field]} label={label} required={field === 'maxScore'} className="num narrow" inputMode="decimal" autoComplete="off" hint={t('ed.cpNumberHint')} value={values[field]} onChange={set(field)} error={fieldError(field)} />
  );
  return (
    <form className="re-sub" role="group" aria-labelledby={labelledBy} noValidate onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} data-testid={`cp-form-${mode}`}>
      {count > 0 ? <Alert>{t('ed.summary', { count })}</Alert> : null}
      {topError ? <Alert>{errorText(topError)}</Alert> : null}
      <TextField id="cp-title" inputRef={refs.title} label={t('ed.cpNameLabel')} required autoComplete="off" counter={t('ed.titleCounter', { n: f.number(values.title.length) })} maxLength={CHECKPOINT_TITLE_MAX + 40} value={values.title} onChange={set('title')} error={fieldError('title')} />
      <TextField id="cp-date" inputRef={refs.date} label={t('ed.cpDateLabel')} required type="date" className="num narrow" value={values.date} onChange={set('date')} error={fieldError('date')} />
      <div className="re-two">
        {numberField('maxScore', t('ed.cpMaxLabel'))}
        {numberField('threshold', t('ed.cpThresholdLabel'))}
      </div>
      {numberField('score', t('ed.cpScoreLabel'))}
      <TextArea id="cp-note" inputRef={refs.note} label={t('ed.cpNoteLabel')} rows={2} counter={t('ed.cpNoteCounter', { n: f.number(values.note.length) })} maxLength={CHECKPOINT_NOTE_MAX + 40} value={values.note} onChange={set('note')} error={fieldError('note')} />
      <div className="re-actions">
        <Button type="submit" variant="primary" className="sm" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('ed.saving') : t('ed.saveCp')}
        </Button>
        <Button variant="secondary" className="sm" onClick={onCancel}>
          {t('ed.cancel')}
        </Button>
      </div>
    </form>
  );
}
