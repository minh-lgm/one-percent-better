// D7 — "Create from QPT 21-week template" (phase 8, M20; DESIGN v8.0 D7, F21, mockup 14-roadmap-template-dialog.html;
// FR-76, A-78, A-86). Lazy-only (ADR-53). A native <dialog> mounted only while open (StopTimerDialog pattern): bottom
// sheet under 640 px, 480 px box above; start date (default today) with a live preview of weeks 1 / 20 / 21, optional
// goal, the language note, errors kept in the dialog. The template content itself lives in domain/roadmap-template.ts
// (service chunk) — nothing of it is in this file.
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { addDaysOrNull, type Roadmap } from '../../../domain/roadmap';
import type { DomainError, Goal, Result } from '../../../domain/types';
import type { RoadmapService } from '../../../services/roadmap-service';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { TextField } from '../Field';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { useToast } from '../../hooks/useToast';
import { GoalLinkPicker } from './GoalLinkPicker';
import { useRoadmapErrors } from './useRoadmapErrors';

/** Week 20 starts 19 weeks after the start date; the last (21st) week ends 21 × 7 − 1 days after it (DESIGN `tpl.preview`). */
const EXAM_OFFSET_DAYS = 19 * 7;
const END_OFFSET_DAYS = 21 * 7 - 1;

export interface TemplateDialogProps {
  /** Local today: the default start date. */
  today: string;
  /** Goals the picker may offer (`linkableGoals(null)`); `undefined` while loading. */
  goals: Goal[] | undefined;
  onCreate: (values: { startDate: string; goalId: string | null }) => Promise<Result<Roadmap>>;
  onCreated: (roadmap: Roadmap) => void;
  onCancel: () => void;
}

export function TemplateDialog({ today, goals, onCreate, onCreated, onCancel }: TemplateDialogProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState(today);
  const [goalId, setGoalId] = useState('');
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [topError, setTopError] = useState<DomainError | 'write' | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // The fields are disabled while busy, so the first field in error is focused once they are enabled again.
  const [focusField, setFocusField] = useState<'startDate' | 'goalId' | null>(null);
  useEffect(() => {
    if (busy || focusField === null) return;
    if (focusField === 'startDate') startRef.current?.focus();
    else document.getElementById(`${id}-goal`)?.focus();
    setFocusField(null);
  }, [busy, focusField, id]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    startRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Esc = Cancel, except while the 32 rows are being written (DESIGN D7 "busy").
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (!busyRef.current) onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  const fieldError = (field: string) => {
    const err = errors.find((e) => e.field === field);
    return err ? errorText(err) : undefined;
  };

  // M20-D1: the start date must be a date whose 21 weeks stay within 9999-12-31; otherwise no preview (never "NaN"),
  // the namespace error under the field, and Create does nothing but show it.
  const exam = addDaysOrNull(startDate, EXAM_OFFSET_DAYS);
  const end = addDaysOrNull(startDate, END_OFFSET_DAYS);
  const fits = exam !== null && end !== null;
  const outOfRange = startDate !== '' && addDaysOrNull(startDate, 0) !== null && !fits;
  const startInvalid: DomainError = { code: 'ROADMAP_DATE_INVALID', field: 'startDate', message: 'startDate: format', params: { variant: 'format' } };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!fits) {
      setErrors((errs) => [...errs.filter((err) => err.field !== 'startDate'), startInvalid]);
      setFocusField('startDate');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setTopError(null);
    try {
      const r = await onCreate({ startDate, goalId: goalId === '' ? null : goalId });
      if (r.ok) {
        onCreated(r.value);
        return;
      }
      const fielded = r.errors.filter((err) => err.field !== undefined);
      setErrors(fielded);
      const other = r.errors.find((err) => err.field === undefined);
      setTopError(other ?? null);
      if (fielded.some((err) => err.field === 'startDate')) setFocusField('startDate');
      else if (fielded.some((err) => err.field === 'goalId')) setFocusField('goalId');
    } catch {
      setTopError('write');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const preview = fits ? t('tpl.preview', { start: f.dateShort(startDate), exam: f.dateShort(exam), end: f.dateShort(end) }) : undefined;
  return (
    <dialog ref={ref} className="dialog tpl" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} data-testid="template-dialog">
      <form noValidate onSubmit={submit} aria-busy={busy || undefined}>
        <div className="dialog-body">
          <h2 id={`${id}-title`}>{t('tpl.title')}</h2>
          <p id={`${id}-body`}>{t('tpl.body')}</p>
          <TextField
            id={`${id}-start`}
            inputRef={startRef}
            label={t('tpl.startLabel')}
            type="date"
            className="num narrow"
            required
            disabled={busy}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setErrors((errs) => errs.filter((err) => err.field !== 'startDate'));
            }}
            hint={preview}
            error={fieldError('startDate') ?? (outOfRange ? errorText(startInvalid) : undefined)}
          />
          <GoalLinkPicker
            id={`${id}-goal`}
            value={goalId}
            goals={goals}
            disabled={busy}
            error={fieldError('goalId')}
            onChange={(v) => {
              setGoalId(v);
              setErrors((errs) => errs.filter((err) => err.field !== 'goalId'));
            }}
          />
          <p className="hint tpl-lang">{t('tpl.langNote', { language: t('tpl.languageName') })}</p>
          {topError ? <Alert>{errorText(topError)}</Alert> : null}
        </div>
        <div className="actions">
          <Button type="submit" variant="primary" aria-disabled={busy || undefined} aria-busy={busy || undefined} data-testid="template-create">
            {busy ? t('tpl.creating') : t('ed.create')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {t('ed.cancel')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * The D7 entry point for a screen (S11 empty state + header, S12 banner): `open()` from the button, `dialog` rendered
 * by the screen. Loads the picker goals once per opening, creates through `RoadmapService.createFromQptTemplate` in
 * the app language (A-86), then toasts and goes to the new roadmap's detail (which focuses its `<h1>`). Cancel puts
 * focus back on the button that opened it.
 */
export function useTemplateDialog(service: RoadmapService | null, today: string): { open: () => void; dialog: ReactNode } {
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const [isOpen, setOpen] = useState(false);
  const [goals, setGoals] = useState<Goal[] | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !service) return;
    let active = true;
    setGoals(undefined);
    service.linkableGoals(null).then((g) => active && setGoals(g), () => active && setGoals([]));
    return () => {
      active = false;
    };
  }, [isOpen, service]);

  const open = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const cancel = useCallback(() => {
    setOpen(false);
    const el = opener.current;
    requestAnimationFrame(() => el?.focus());
  }, []);

  const dialog =
    isOpen && service ? (
      <TemplateDialog
        today={today}
        goals={goals}
        onCreate={({ startDate, goalId }) => service.createFromQptTemplate({ startDate, goalId, locale: f.locale }, today)}
        onCreated={(roadmap) => {
          setOpen(false);
          toast.show('roadmap:toast.templateCreated');
          void navigate(`/roadmaps/${roadmap.id}`);
        }}
        onCancel={cancel}
      />
    ) : null;
  return { open, dialog };
}
