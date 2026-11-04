// Inline item form of S14 (DESIGN v8.0 S14 `ItemEditor`, "Quy tắc form" (3): suggested 7 days after the last item,
// A-83): title, planned start / end, phase (moves the item to the end of the chosen phase), note. Lazy-only (ADR-53).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ITEM_NOTE_MAX, ITEM_TITLE_MAX } from '../../../config/constants';
import type { ItemInput, RoadmapItem, RoadmapPhase } from '../../../domain/roadmap';
import type { DomainError, Result } from '../../../domain/types';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { TextArea, TextField } from '../Field';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { useRoadmapErrors } from './useRoadmapErrors';

export interface ItemEditorProps {
  mode: 'add' | 'edit';
  initial: RoadmapItem | null;
  /** Phases of the roadmap, in order (the `Phase` select). */
  phases: readonly RoadmapPhase[];
  /** The phase the item belongs to (add: the phase whose `Add item` was pressed). */
  phaseId: string;
  /** Default planned range for a new item (A-83). */
  suggested?: { plannedStart: string; plannedEnd: string };
  labelledBy: string;
  onDirty: (dirty: boolean) => void;
  onSave: (input: ItemInput, phaseId: string) => Promise<Result<RoadmapItem>>;
  onSaved: (item: RoadmapItem) => void;
  onCancel: () => void;
}

type Field = 'title' | 'plannedStart' | 'plannedEnd' | 'note';
const ORDER: Field[] = ['title', 'plannedStart', 'plannedEnd', 'note'];

export function ItemEditor({ mode, initial, phases, phaseId, suggested, labelledBy, onDirty, onSave, onSaved, onCancel }: ItemEditorProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const start0 = initial?.plannedStart ?? suggested?.plannedStart ?? '';
  const end0 = initial?.plannedEnd ?? suggested?.plannedEnd ?? '';
  const [title, setTitle] = useState(initial?.title ?? '');
  const [plannedStart, setStart] = useState(start0);
  const [plannedEnd, setEnd] = useState(end0);
  const [phase, setPhase] = useState(phaseId);
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [topError, setTopError] = useState<DomainError | 'write' | null>(null);
  const [saving, setSaving] = useState(false);
  const refs = {
    title: useRef<HTMLInputElement>(null),
    plannedStart: useRef<HTMLInputElement>(null),
    plannedEnd: useRef<HTMLInputElement>(null),
    note: useRef<HTMLTextAreaElement>(null),
  };
  useEffect(() => {
    refs.title.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount
  }, []);
  useEffect(() => {
    onDirty(title !== (initial?.title ?? '') || plannedStart !== start0 || plannedEnd !== end0 || phase !== phaseId || note !== (initial?.note ?? ''));
  }, [title, plannedStart, plannedEnd, phase, note, initial, start0, end0, phaseId, onDirty]);

  const fieldError = (field: Field) => {
    const err = errors.find((e) => e.field === field);
    return err ? errorText(err) : undefined;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTopError(null);
    const input: ItemInput = { title, note, plannedStart, plannedEnd, actualStart: initial?.actualStart ?? null, actualEnd: initial?.actualEnd ?? null };
    try {
      const r = await onSave(input, phase);
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
  return (
    <form className="re-sub" role="group" aria-labelledby={labelledBy} noValidate onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} data-testid={`item-form-${mode}`}>
      {count > 0 ? <Alert>{t('ed.summary', { count })}</Alert> : null}
      {topError ? <Alert>{errorText(topError)}</Alert> : null}
      <TextField id="it-title" inputRef={refs.title} label={t('ed.itemTitleLabel')} required autoComplete="off" counter={t('ed.itemTitleCounter', { n: f.number(title.length) })} maxLength={ITEM_TITLE_MAX + 40} value={title} onChange={(e) => setTitle(e.target.value)} error={fieldError('title')} />
      <div className="re-two">
        <TextField id="it-start" inputRef={refs.plannedStart} label={t('ed.plannedStart')} required type="date" className="num narrow date-fit" value={plannedStart} onChange={(e) => setStart(e.target.value)} error={fieldError('plannedStart')} hint={mode === 'add' ? t('ed.itemDatesHint') : undefined} />
        <TextField id="it-end" inputRef={refs.plannedEnd} label={t('ed.plannedEnd')} required type="date" className="num narrow date-fit" value={plannedEnd} onChange={(e) => setEnd(e.target.value)} error={fieldError('plannedEnd')} />
      </div>
      <div className="field">
        <label htmlFor="it-phase">{t('ed.itemPhaseLabel')}</label>
        <select id="it-phase" className="input" value={phase} onChange={(e) => setPhase(e.target.value)}>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <TextArea id="it-note" inputRef={refs.note} label={t('ed.itemNoteLabel')} rows={2} counter={t('item.noteCounter', { n: f.number(note.length) })} maxLength={ITEM_NOTE_MAX + 40} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError('note')} />
      <div className="re-actions">
        <Button type="submit" variant="primary" className="sm" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('ed.saving') : t('ed.saveItem')}
        </Button>
        <Button variant="secondary" className="sm" onClick={onCancel}>
          {t('ed.cancel')}
        </Button>
      </div>
    </form>
  );
}
