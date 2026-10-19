import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GOAL_NAME_MAX, GOAL_WHY_MAX } from '../../config/constants';
import { daysInclusive, endOfYearOf, isValidISODate, toISODate } from '../../domain/dates';
import type { GoalInput } from '../../domain/goal';
import type { DomainError, Goal, TargetType } from '../../domain/types';
import { Alert } from '../components/Alert';
import { Button, LinkButton } from '../components/Button';
import { TextArea, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { Skeleton } from '../components/Skeleton';
import { errorMessage, WRITE_FAILED_KEY } from '../error-messages';
import { parseDecimalInput } from '../number-input';
import { useDelayed } from '../hooks/useDelayed';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import { NotFound } from './NotFound';

/** v4.0 (M11, DESIGN S3): `never` = "No end date" (`endDate: null`), only with Minutes per day. */
type EndsMode = 'thisYear' | 'specific' | 'never';

interface FormState {
  name: string;
  why: string;
  targetType: TargetType;
  targetValue: string;
  startDate: string;
  endsMode: EndsMode;
  endDate: string;
  /** DESIGN A-D53: Ends was forced from "No end date" to "This year" by switching to Total hours (announced once). */
  endsSwitched: boolean;
}

const FIELD_ORDER = ['name', 'why', 'target', 'startDate', 'endDate', 'period'] as const;
const NEVER_DESC_ID = 'goal-ends-never-desc';
const ENDS_ERR_ID = 'goal-ends-err';

function initialState(today: string, goal?: Goal): FormState {
  if (!goal) {
    return { name: '', why: '', targetType: 'daily', targetValue: '', startDate: today, endsMode: 'thisYear', endDate: today, endsSwitched: false };
  }
  // Open-ended goal (A-D60): "No end date" selected; the hidden End date starts at the end of the start year.
  if (goal.endDate === null) {
    return { name: goal.name, why: goal.why, targetType: goal.targetType, targetValue: String(goal.targetMinutes), startDate: goal.startDate, endsMode: 'never', endDate: endOfYearOf(goal.startDate), endsSwitched: false };
  }
  const thisYear = goal.endDate === endOfYearOf(goal.startDate);
  return {
    name: goal.name,
    why: goal.why,
    targetType: goal.targetType,
    targetValue: String(goal.targetType === 'daily' ? goal.targetMinutes : goal.targetMinutes / 60),
    startDate: goal.startDate,
    endsMode: thisYear ? 'thisYear' : 'specific',
    endDate: goal.endDate,
    endsSwitched: false,
  };
}

/** Create/edit goal (DESIGN S3). Errors are kept as codes so a language change re-translates them. */
export function GoalForm() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { goalService } = useServices();
  const today = toISODate(useNow());

  const [goal, setGoal] = useState<Goal | null | undefined>(editing ? undefined : null);
  const [entryRange, setEntryRange] = useState<{ first: string; last: string } | null>(null);
  const [state, setState] = useState<FormState>(() => initialState(today));
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const loading = editing && goal === undefined;
  const showSkeleton = useDelayed(loading);

  const refs = {
    name: useRef<HTMLInputElement>(null),
    why: useRef<HTMLTextAreaElement>(null),
    target: useRef<HTMLInputElement>(null),
    startDate: useRef<HTMLInputElement>(null),
    endDate: useRef<HTMLInputElement>(null),
  };
  const endsRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!editing || !id) return;
    let active = true;
    void (async () => {
      const g = await goalService.getById(id);
      const range = g ? await goalService.entryDateRange(id) : null;
      if (!active) return;
      setGoal(g ?? null);
      setEntryRange(range);
      if (g) setState(initialState(today, g));
    })();
    return () => {
      active = false;
    };
  }, [editing, id, goalService, today]);

  if (editing && goal === null) return <NotFound variant="goal" />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));

  // DESIGN S3 (v4.0): "No end date" only works with Minutes per day. Switching to Total hours while it is
  // selected moves Ends to "This year" and announces it once (A-D53); switching back never re-selects it.
  const setTargetType = (v: TargetType) =>
    setState((s) => {
      if (v === 'total' && s.endsMode === 'never') return { ...s, targetType: v, endsMode: 'thisYear', endsSwitched: true };
      return { ...s, targetType: v, endsSwitched: v === 'daily' ? false : s.endsSwitched };
    });
  const setEndsMode = (v: EndsMode) => setState((s) => ({ ...s, endsMode: v, endsSwitched: false }));

  const openEnded = state.endsMode === 'never';
  const neverLocked = state.targetType === 'total';
  const effectiveEnd = openEnded ? null : state.endsMode === 'thisYear' ? endOfYearOf(state.startDate || today) : state.endDate;

  const fieldError = (field: string): string | undefined => {
    const err = errors.find((e) => e.field === field);
    if (!err) return undefined;
    const m = errorMessage(err, f);
    return t(m.key, m.params);
  };

  const hint = (() => {
    const v = parseDecimalInput(state.targetValue);
    // No end date → no "over N days" hint (the description under the radio explains instead).
    if (effectiveEnd === null) return undefined;
    if (!Number.isInteger(v) || v <= 0 || !isValidISODate(state.startDate) || !isValidISODate(effectiveEnd) || effectiveEnd < state.startDate) return undefined;
    const days = daysInclusive(state.startDate, effectiveEnd);
    const daysText = t('format.daysCount', { count: days });
    if (state.targetType === 'daily') {
      const total = v * days;
      return t('goal.form.hintDaily', { total: f.number(total), hours: f.decimal1(total / 60), days: daysText });
    }
    const daily = Math.ceil((v * 60) / days);
    if (daily > 1440) return undefined;
    return t('goal.form.hintTotal', { daily: f.number(daily), days: daysText });
  })();

  const startHint = editing && entryRange ? t('goal.form.startHint', { first: f.dateShort(entryRange.first), last: f.dateShort(entryRange.last) }) : undefined;
  const periodError = fieldError('period');
  // An endDate error while the End date field is hidden (openEndedTotal safety net) shows under the Ends group.
  const endsError = openEnded ? fieldError('endDate') : undefined;
  const neverDesc = neverLocked ? t('goal.form.endsNeverTotalNote') : openEnded ? t('goal.form.endsNeverHint') : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setWriteFailed(false);
    const input: GoalInput = {
      name: state.name,
      why: state.why,
      targetType: state.targetType,
      targetValue: parseDecimalInput(state.targetValue),
      startDate: state.startDate,
      // Only a daily goal may be open-ended; the domain refuses `total` + null anyway (A-48).
      endDate: openEnded && state.targetType === 'daily' ? null : (effectiveEnd ?? endOfYearOf(state.startDate || today)),
    };
    try {
      const now = new Date();
      const result = editing && id ? await goalService.update(id, input, now) : await goalService.create(input, now);
      if (result.ok) {
        toast.show(editing ? 'toast.goalUpdated' : 'toast.goalCreated');
        void navigate('/goals');
        return;
      }
      setErrors(result.errors);
      const first = FIELD_ORDER.find((fld) => result.errors.some((err) => err.field === fld));
      if (first === 'endDate' && openEnded) {
        // The End date field is hidden: focus the selected radio of the Ends group (DESIGN S3 state 5).
        const radios = endsRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)');
        const checked = Array.from(radios ?? []).find((r) => r.checked) ?? radios?.[0];
        checked?.focus();
        return;
      }
      const target = first === 'period' ? refs.startDate : first ? refs[first] : refs.name;
      target.current?.focus();
    } catch {
      setWriteFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const errorFields = new Set(errors.map((e) => e.field));
  const title = editing ? t('goal.form.titleEdit') : t('goal.form.titleNew');
  const back = (
    <LinkButton variant="ghost" className="back" to="/goals" icon="left">
      {t('nav.goals')}
    </LinkButton>
  );

  return (
    <>
      <PageHeader title={title} back={back} />
      {loading ? (
        showSkeleton ? <Skeleton /> : null
      ) : (
        <form className="card" noValidate aria-label={editing ? t('goal.form.srEdit') : t('goal.form.srNew')} onSubmit={handleSubmit}>
          {errorFields.size > 0 ? <Alert>{t('goal.form.summary', { count: errorFields.size })}</Alert> : null}
          {writeFailed ? <Alert>{t(WRITE_FAILED_KEY)}</Alert> : null}

          <TextField
            id="goal-name"
            inputRef={refs.name}
            label={t('goal.form.nameLabel')}
            required
            autoComplete="off"
            placeholder={t('goal.form.namePlaceholder')}
            counter={t('goal.form.nameCounter', { n: state.name.length })}
            maxLength={GOAL_NAME_MAX + 40}
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            error={fieldError('name')}
          />
          <TextArea
            id="goal-why"
            inputRef={refs.why}
            label={t('goal.form.whyLabel')}
            placeholder={t('goal.form.whyPlaceholder')}
            counter={t('goal.form.whyCounter', { n: state.why.length })}
            maxLength={GOAL_WHY_MAX + 40}
            value={state.why}
            onChange={(e) => set('why', e.target.value)}
            error={fieldError('why')}
          />

          <SegmentedControl<TargetType>
            name="targetType"
            legend={t('goal.form.targetLegend')}
            value={state.targetType}
            onChange={setTargetType}
            options={[
              { value: 'daily', label: t('goal.form.targetDaily') },
              { value: 'total', label: t('goal.form.targetTotal') },
            ]}
          />
          <TextField
            id="goal-target"
            inputRef={refs.target}
            label={state.targetType === 'daily' ? t('goal.form.targetDaily') : t('goal.form.targetTotal')}
            required
            className="num"
            inputMode="numeric"
            autoComplete="off"
            suffix={state.targetType === 'daily' ? t('unit.min') : t('unit.hour')}
            value={state.targetValue}
            onChange={(e) => set('targetValue', e.target.value)}
            hint={hint}
            error={fieldError('target')}
          />

          <TextField
            id="goal-start"
            inputRef={refs.startDate}
            label={t('goal.form.startLabel')}
            required
            type="date"
            className="num narrow"
            value={state.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            hint={startHint}
            error={fieldError('startDate') ?? periodError}
          />

          <fieldset ref={endsRef} aria-describedby={endsError ? ENDS_ERR_ID : undefined}>
            <legend className="legend">{t('goal.form.endsLegend')}</legend>
            <label className="radio">
              <input type="radio" name="endsMode" value="thisYear" checked={state.endsMode === 'thisYear'} onChange={() => setEndsMode('thisYear')} />
              <span>{t('goal.form.endsThisYear', { date: f.dateShort(endOfYearOf(isValidISODate(state.startDate) ? state.startDate : today)) })}</span>
            </label>
            <label className="radio">
              <input type="radio" name="endsMode" value="specific" checked={state.endsMode === 'specific'} onChange={() => setEndsMode('specific')} />
              <span>{t('goal.form.endsSpecific')}</span>
            </label>
            {state.endsMode === 'specific' ? (
              // v4.0 (A-D54): the End date sits right under its radio, before "No end date".
              <div className="nested">
                <TextField
                  id="goal-end"
                  inputRef={refs.endDate}
                  label={t('goal.form.endLabel')}
                  required
                  type="date"
                  className="num narrow"
                  value={state.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  error={fieldError('endDate')}
                />
              </div>
            ) : null}
            <label className="radio">
              <input
                type="radio"
                name="endsMode"
                value="never"
                checked={openEnded}
                disabled={neverLocked}
                aria-describedby={neverDesc ? NEVER_DESC_ID : undefined}
                onChange={() => setEndsMode('never')}
              />
              <span>{t('goal.form.endsNever')}</span>
            </label>
            {neverDesc ? (
              <p id={NEVER_DESC_ID} className="hint radio-desc">
                {neverDesc}
              </p>
            ) : null}
            {/* Always in the DOM so the announcement is read once when Ends is forced to "This year" (DESIGN §8.2). */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="ends-status">
              {state.endsSwitched ? t('goal.form.endsNeverSwitched') : ''}
            </div>
            {endsError ? (
              <p id={ENDS_ERR_ID} className="err">
                <Icon name="alert" />
                <span>{endsError}</span>
              </p>
            ) : null}
          </fieldset>

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={saving} aria-busy={saving || undefined}>
              {saving ? t('common.saving') : editing ? t('goal.form.saveChanges') : t('goal.form.save')}
            </Button>
            <LinkButton variant="secondary" to="/goals">
              {t('common.cancel')}
            </LinkButton>
          </div>
        </form>
      )}
    </>
  );
}
