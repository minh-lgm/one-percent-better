export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  lang?: string;
}

export interface SegmentedControlProps<V extends string> {
  name: string;
  legend: string;
  legendHidden?: boolean;
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  describedBy?: string;
  className?: string;
}

/** Radio group styled as a segmented control (DESIGN §5). */
export function SegmentedControl<V extends string>({ name, legend, legendHidden, options, value, onChange, describedBy, className = '' }: SegmentedControlProps<V>) {
  return (
    <fieldset aria-describedby={describedBy}>
      <legend className={legendHidden ? 'sr-only' : 'legend'}>{legend}</legend>
      <div className={`seg ${className}`.trim()}>
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span lang={o.lang}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
