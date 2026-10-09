import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GOAL_NAME_MAX, GOAL_WHY_MAX } from '../../config/constants';
import { daysInclusive, endOfYearOf, isValidISODate, toISODate } from '../../domain/dates';
import type { GoalInput } from '../../domain/goal';
import type { DomainError, Goal, TargetType } from '../../domain/types';
import { Alert } from '../components/Alert';
import { Button, LinkButton } from '../components/Button';
import { TextArea, TextField } from '../components/Field';
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

type EndsMode = 'thisYear' | 'specific';

interface FormState {
  name: string;
  why: string;
  targetType: TargetType;
  targetValue: string;
  startDate: string;
  endsMode: EndsMode;
  endDate: string;
}

const FIELD_ORDER = ['name', 'why', 'target', 'startDate', 'endDate', 'period'] as const;

function initialState(today: string, goal?: Goal): FormState {
  if (!goal) {
    return { name: '', why: '', targetType: 'daily', targetValue: '', startDate: today, endsMode: 'thisYear', endDate: today };
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

  const effectiveEnd = state.endsMode === 'thisYear' ? endOfYearOf(state.startDate || today) : state.endDate;

  const fieldError = (field: string): string | undefined => {
    const err = errors.find((e) => e.field === field);
    if (!err) return undefined;
    const m = errorMessage(err, f);
    return t(m.key, m.params);
  };

  const hint = (() => {
    const v = parseDecimalInput(state.targetValue);
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
      endDate: effectiveEnd,
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
            onChange={(v) => set('targetType', v)}
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

          <fieldset>
            <legend className="legend">{t('goal.form.endsLegend')}</legend>
            <label className="radio">
              <input type="radio" name="endsMode" value="thisYear" checked={state.endsMode === 'thisYear'} onChange={() => set('endsMode', 'thisYear')} />
              <span>{t('goal.form.endsThisYear', { date: f.dateShort(endOfYearOf(isValidISODate(state.startDate) ? state.startDate : today)) })}</span>
            </label>
            <label className="radio">
              <input type="radio" name="endsMode" value="specific" checked={state.endsMode === 'specific'} onChange={() => set('endsMode', 'specific')} />
              <span>{t('goal.form.endsSpecific')}</span>
            </label>
            {state.endsMode === 'specific' ? (
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
