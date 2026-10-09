export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  valueText: string;
}

export function ProgressBar({ value, max, label, valueText }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 1000) / 10) : 0;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={valueText}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
