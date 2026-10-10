// Test stand-in for the lazily loaded Recharts curve chart (F-D1): same props and
// accessible wrapper, no Recharts. Screen tests mock the module with it; the real
// chart (lines, markers, labels, keyboard reading) is covered by `CurveChart.test.tsx`.
import type { CurveChartProps } from '../../ui/components/CurveChart';

export default function CurveChartStub({ ideal, actual, label, testId }: CurveChartProps) {
  return (
    <>
      <div className="chart curve-chart" role="img" aria-label={label} tabIndex={0} data-testid={testId} data-stub="curve-chart" data-ideal={ideal.length} data-actual={actual.length} />
      <p className="chart-reading" aria-live="polite" data-testid="curve-reading" />
    </>
  );
}
