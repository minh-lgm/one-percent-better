import { useT } from '../hooks/useT';

export interface SwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Toggle with `role="switch"` and a visible On/Off word (DESIGN §5, §8). */
export function Switch({ id, label, description, checked, disabled = false, onChange }: SwitchProps) {
  const { t } = useT();
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className="sw-row">
      <div className="sw-text">
        <label htmlFor={id}>{label}</label>
        {description ? (
          <p id={descId} className="hint">
            {description}
          </p>
        ) : null}
      </div>
      <div className="sw-ctl">
        <span className="sw-state" aria-hidden="true">
          {checked ? t('settings.reminders.on') : t('settings.reminders.off')}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="switch"
          checked={checked}
          aria-checked={checked}
          aria-describedby={descId}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </div>
  );
}
