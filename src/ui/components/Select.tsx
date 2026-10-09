import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'onChange'> {
  id: string;
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Labelled native select (DESIGN §5 Select; Review M4). */
export function Select({ id, label, options, value, onChange, className = '', ...rest }: SelectProps) {
  return (
    <div className="ctl">
      <label htmlFor={id}>{label}</label>
      <select id={id} className={`input ${className}`.trim()} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
