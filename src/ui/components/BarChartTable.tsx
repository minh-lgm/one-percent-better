import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

export interface BarTablePoint {
  key: string;
  /** Tooltip / table label (week range or month name). */
  label: string;
  minutes: number;
}

/** Visually hidden data table equivalent of a BarChart (DESIGN §8). No chart dependency. */
export function BarChartTable({ points, caption, columnHeader }: { points: BarTablePoint[]; caption: string; columnHeader: string }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{columnHeader}</th>
          <th scope="col">{t('chart.bar.colTime')}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.key}>
            <th scope="row">{p.label}</th>
            <td>{f.duration(p.minutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
