// Inline phase form of S14 (DESIGN v8.0 S14 `PhaseEditor`): title + note, `Save phase` / `Cancel`. Lazy-only (ADR-53).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PHASE_NOTE_MAX, PHASE_TITLE_MAX } from '../../../config/constants';
import type { PhaseInput, RoadmapPhase } from '../../../domain/roadmap';
import type { DomainError, Result } from '../../../domain/types';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { TextArea, TextField } from '../Field';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { useRoadmapErrors } from './useRoadmapErrors';

export interface PhaseEditorProps {
  mode: 'add' | 'edit';
  initial: RoadmapPhase | null;
  labelledBy: string;
  onDirty: (dirty: boolean) => void;
  onSave: (input: PhaseInput) => Promise<Result<RoadmapPhase>>;
  onSaved: (phase: RoadmapPhase) => void;
  onCancel: () => void;
}

export function PhaseEditor({ mode, initial, labelledBy, onDirty, onSave, onSaved, onCancel }: PhaseEditorProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [topError, setTopError] = useState<DomainError | 'write' | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    onDirty(title !== (initial?.title ?? '') || note !== (initial?.note ?? ''));
  }, [title, note, initial, onDirty]);

  const fieldError = (field: string) => {
    const err = errors.find((e) => e.field === field);
    return err ? errorText(err) : undefined;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTopError(null);
    try {
      const r = await onSave({ title, note });
      if (r.ok) {
        onSaved(r.value);
        return;
      }
      setErrors(r.errors.filter((err) => err.field !== undefined));
      const other = r.errors.find((err) => err.field === undefined);
      if (other) setTopError(other);
      if (r.errors.some((err) => err.field === 'title')) titleRef.current?.focus();
      else if (r.errors.some((err) => err.field === 'note')) noteRef.current?.focus();
    } catch {
      setTopError('write');
    } finally {
      setSaving(false);
    }
  }

  const count = new Set(errors.map((err) => err.field)).size;
  return (
    <form className="re-sub" role="group" aria-labelledby={labelledBy} noValidate onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} data-testid={`phase-form-${mode}`}>
      {count > 0 ? <Alert>{t('ed.summary', { count })}</Alert> : null}
      {topError ? <Alert>{errorText(topError)}</Alert> : null}
      <TextField id="ph-title" inputRef={titleRef} label={t('ed.phaseTitleLabel')} required autoComplete="off" counter={t('ed.titleCounter', { n: f.number(title.length) })} maxLength={PHASE_TITLE_MAX + 40} value={title} onChange={(e) => setTitle(e.target.value)} error={fieldError('title')} />
      <TextArea id="ph-note" inputRef={noteRef} label={t('ed.phaseNoteLabel')} rows={2} placeholder={t('ed.phaseNotePlaceholder')} counter={t('ed.phaseNoteCounter', { n: f.number(note.length) })} maxLength={PHASE_NOTE_MAX + 40} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError('note')} />
      <div className="re-actions">
        <Button type="submit" variant="primary" className="sm" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('ed.saving') : t('ed.savePhase')}
        </Button>
        <Button variant="secondary" className="sm" onClick={onCancel}>
          {t('ed.cancel')}
        </Button>
      </div>
    </form>
  );
}
