// Roadmap fields form of S12 (create) and S14 "Save details" (DESIGN v8.0 S12, S14 "Quy tắc form" (1), (4); FR-69,
// FR-70, A-78). Lazy-only (ADR-53). Errors are kept as codes so a language change re-translates them; the first field
// in error gets focus and `ed.summary` counts them (role="alert").
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ROADMAP_MILESTONE_LABEL_MAX, ROADMAP_NOTE_MAX, ROADMAP_TITLE_MAX } from '../../../config/constants';
import type { Roadmap, RoadmapInput } from '../../../domain/roadmap';
import type { DomainError, Goal, Result } from '../../../domain/types';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { TextArea, TextField } from '../Field';
import { parseDecimalInput } from '../../number-input';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { GoalLinkPicker } from './GoalLinkPicker';
import { useRoadmapErrors } from './useRoadmapErrors';

export interface RoadmapFieldsProps {
  /** `null` when creating. */
  roadmap: Roadmap | null;
  /** Goals the picker may offer (`RoadmapService.linkableGoals`); `undefined` while loading. */
  goals: Goal[] | undefined;
  /** The roadmap's goal no longer exists (link state `missing`). */
  goalMissing?: boolean;
  srLabel: string;
  submitLabel: string;
  /** `.hint` under the button (S12 `new.afterCreate`). */
  afterHint?: string;
  /** Focus the goal picker on mount ("Link a goal" entry from the detail). */
  focusGoal?: boolean;
  onSubmit: (input: RoadmapInput) => Promise<Result<Roadmap>>;
  onSaved: (roadmap: Roadmap) => void;
}

type Field = 'title' | 'note' | 'goalId' | 'weeklyTarget' | 'milestoneLabel' | 'milestoneDate';
const FIELD_ORDER: Field[] = ['title', 'note', 'goalId', 'weeklyTarget', 'milestoneLabel', 'milestoneDate'];

/** Hours per week as the user types them (`8,5` in vi); `''` = no target; anything else goes to the domain as a number (NaN = invalid). */
export function parseHours(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return parseDecimalInput(trimmed.replace(',', '.'));
}

export function RoadmapFields({ roadmap, goals, goalMissing = false, srLabel, submitLabel, afterHint, focusGoal = false, onSubmit, onSaved }: RoadmapFieldsProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const [title, setTitle] = useState(roadmap?.title ?? '');
  const [note, setNote] = useState(roadmap?.note ?? '');
  const [goalId, setGoalId] = useState(roadmap?.goalId && !goalMissing ? roadmap.goalId : '');
  const [target, setTarget] = useState(() => {
    if (!roadmap || roadmap.weeklyTargetMinutes === null) return '';
    const hours = String(roadmap.weeklyTargetMinutes / 60);
    return f.locale === 'vi' ? hours.replace('.', ',') : hours;
  });
  const [milestoneLabel, setMilestoneLabel] = useState(roadmap?.milestoneLabel ?? '');
  const [milestoneDate, setMilestoneDate] = useState(roadmap?.milestoneDate ?? '');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [topError, setTopError] = useState<DomainError | 'write' | null>(null);
  const [saving, setSaving] = useState(false);

  const refs = {
    title: useRef<HTMLInputElement>(null),
    note: useRef<HTMLTextAreaElement>(null),
    weeklyTarget: useRef<HTMLInputElement>(null),
    milestoneLabel: useRef<HTMLInputElement>(null),
    milestoneDate: useRef<HTMLInputElement>(null),
  };
  const goalSelectId = 'rm-goal';
  useEffect(() => {
    if (focusGoal) document.getElementById(goalSelectId)?.focus();
  }, [focusGoal]);

  const fieldError = (field: Field): string | undefined => {
    const err = errors.find((e) => e.field === field);
    return err ? errorText(err) : undefined;
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTopError(null);
    const input: RoadmapInput = {
      title,
      note,
      goalId: goalId === '' ? null : goalId,
      weeklyTargetHours: parseHours(target),
      milestoneLabel,
      milestoneDate: milestoneDate === '' ? null : milestoneDate,
    };
    try {
      const result = await onSubmit(input);
      if (result.ok) {
        setErrors([]);
        onSaved(result.value);
        return;
      }
      const fielded = result.errors.filter((err) => err.field !== undefined);
      setErrors(fielded);
      const other = result.errors.find((err) => err.field === undefined);
      if (other) setTopError(other);
      const first = FIELD_ORDER.find((fld) => fielded.some((err) => err.field === fld));
      if (first === 'goalId') document.getElementById(goalSelectId)?.focus();
      else if (first) refs[first].current?.focus();
    } catch {
      setTopError('write');
    } finally {
      setSaving(false);
    }
  }

  const errorFields = new Set(errors.map((err) => err.field));
  return (
    <form className="re-form" noValidate aria-label={srLabel} onSubmit={handleSubmit} data-testid="roadmap-fields">
      {errorFields.size > 0 ? <Alert>{t('ed.summary', { count: errorFields.size })}</Alert> : null}
      {topError ? <Alert>{errorText(topError)}</Alert> : null}
      <TextField
        id="rm-title"
        inputRef={refs.title}
        label={t('ed.titleLabel')}
        required
        autoComplete="off"
        placeholder={t('ed.titlePlaceholder')}
        counter={t('ed.titleCounter', { n: f.number(title.length) })}
        maxLength={ROADMAP_TITLE_MAX + 40}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={fieldError('title')}
      />
      <TextArea
        id="rm-note"
        inputRef={refs.note}
        label={t('ed.noteLabel')}
        rows={4}
        counter={t('ed.noteCounter', { n: f.number(note.length) })}
        maxLength={ROADMAP_NOTE_MAX + 40}
        hint={t('ed.noteHint')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={fieldError('note')}
      />
      <GoalLinkPicker id={goalSelectId} value={goalId} goals={goals} missing={goalMissing && goalId === ''} error={fieldError('goalId')} onChange={setGoalId} />
      <TextField
        id="rm-target"
        inputRef={refs.weeklyTarget}
        label={t('ed.targetLabel')}
        className="num"
        inputMode="decimal"
        autoComplete="off"
        suffix={t('ed.hoursSuffix')}
        hint={t('ed.targetHint')}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        error={fieldError('weeklyTarget')}
      />
      <div className="re-two">
        <TextField
          id="rm-ml"
          inputRef={refs.milestoneLabel}
          label={t('ed.milestoneLabelLabel')}
          autoComplete="off"
          placeholder={t('ed.milestoneLabelPlaceholder')}
          counter={t('ed.milestoneLabelCounter', { n: f.number(milestoneLabel.length) })}
          maxLength={ROADMAP_MILESTONE_LABEL_MAX + 40}
          value={milestoneLabel}
          onChange={(e) => setMilestoneLabel(e.target.value)}
          error={fieldError('milestoneLabel')}
        />
        <TextField id="rm-md" inputRef={refs.milestoneDate} label={t('ed.milestoneDateLabel')} type="date" className="num narrow" hint={t('ed.milestoneHint')} value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} error={fieldError('milestoneDate')} />
      </div>
      <div className="re-actions">
        <Button type="submit" variant="primary" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('ed.saving') : submitLabel}
        </Button>
      </div>
      {afterHint ? <p className="hint">{afterHint}</p> : null}
    </form>
  );
}
