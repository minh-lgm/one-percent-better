// Goal picker of S12 / S14 (DESIGN v8.0 S14 "Picker goal", A-78, A-D86). Lazy-only (ADR-53). The list it receives is
// already filtered by `RoadmapService.linkableGoals`: live goals that are not archived and not linked to another
// roadmap, plus the goal linked to this very roadmap (shown as "{name} (archived)" when archived).
import { Link } from 'react-router';
import type { Goal } from '../../../domain/types';
import { Icon } from '../Icon';
import { useT } from '../../hooks/useT';

export interface GoalLinkPickerProps {
  id: string;
  /** Selected goal id (`''` = no goal). */
  value: string;
  /** `undefined` while loading. */
  goals: Goal[] | undefined;
  /** The roadmap's current `goalId` when the goal no longer exists (link state `missing`). */
  missing?: boolean;
  error?: string;
  onChange: (goalId: string) => void;
}

export function GoalLinkPicker({ id, value, goals, missing = false, error, onChange }: GoalLinkPickerProps) {
  const { t } = useT('roadmap');
  const loading = goals === undefined;
  const none = !loading && goals.length === 0;
  const describedBy = [error ? `${id}-err` : null, `${id}-hint`, missing ? `${id}-missing` : null, none ? `${id}-none` : null].filter(Boolean).join(' ');
  return (
    <div className="field" data-testid="goal-picker">
      <label htmlFor={id}>{t('ed.goalLabel')}</label>
      <select id={id} className="input" value={value} aria-busy={loading || undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('ed.goalNone')}</option>
        {(goals ?? []).map((g) => (
          <option key={g.id} value={g.id}>
            {g.archived ? t('ed.goalArchivedOption', { name: g.name }) : g.name}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-err`} className="err">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : null}
      <p id={`${id}-hint`} className="hint">
        {t('ed.goalHint')}
      </p>
      {missing ? (
        <p id={`${id}-missing`} className="hint" data-testid="goal-picker-missing">
          {t('ed.goalMissing')}
        </p>
      ) : null}
      {none ? (
        <p id={`${id}-none`} className="hint" data-testid="goal-picker-none">
          {t('ed.goalNoGoals')} <Link to="/goals/new">{t('ed.goalNoGoalsLink')}</Link>
        </p>
      ) : null}
    </div>
  );
}
