// Test stand-in for the lazily loaded Recharts bar chart (F-D1): same props and
// accessible structure (figure, caption, hidden table), no Recharts. Screen tests
// `vi.mock('../components/BarChart', () => import('../../test/stubs/BarChart'))`;
// the real chart is covered by `BarChart.test.tsx` (static import) and E2E.
import { BarChartTable } from '../../ui/components/BarChartTable';
import type { BarChartProps } from '../../ui/components/BarChart';

export default function BarChartStub({ points, caption, columnHeader, summary, testId }: BarChartProps) {
  return (
    <>
      <figure className="chart-figure" data-testid={testId} data-stub="bar-chart">
        <div className="chart" aria-hidden="true" data-points={points.length} />
        <figcaption className="muted small chart-sum">{summary}</figcaption>
      </figure>
      <BarChartTable points={points} caption={caption} columnHeader={columnHeader} />
    </>
  );
}
