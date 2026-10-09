import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: string;
  /** Secondary line(s) under the value. */
  sub?: ReactNode;
  /** Progress 0–100 (clamped for the bar) with an accessible label. */
  progress?: { value: number; label: string; valueText: string };
  /** Word-like value (e.g. "30 min behind"): full row and smaller type on narrow screens (DESIGN §3.4). */
  textValue?: boolean;
  testId?: string;
}

/** One statistic (DESIGN §5 StatCard; Review M4, Goal detail M5). */
export function StatCard({ label, value, sub, progress, textValue = false, testId }: StatCardProps) {
  return (
    <div className={`card stat${textValue ? ' text-value' : ''}`} data-testid={testId}>
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
      {progress ? (
        <div className="progress" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.value * 10) / 10} aria-valuetext={progress.valueText}>
          <span style={{ width: `${Math.min(100, Math.max(0, progress.value))}%` }} />
        </div>
      ) : null}
    </div>
  );
}
