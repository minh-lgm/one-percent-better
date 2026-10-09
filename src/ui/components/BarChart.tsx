// Recharts bar chart (DESIGN §5 BarChart, §8). This module is only ever loaded
// through `lazy(() => import(...))` from the Review screen (ADR-10), so Recharts
// stays out of the initial bundle (NFR-03).
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Bar, BarChart as RBarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

export interface BarPoint {
  key: string;
  /** Axis tick. */
  tick: string;
  /** Tooltip / table label (week range or month name). */
  label: string;
  minutes: number;
  /** Current week/month: highlighted bar. */
  current: boolean;
}

export interface BarChartProps {
  points: BarPoint[];
  /** Caption of the visually hidden data table. */
  caption: string;
  /** Header of the first table column (`Week starting` / `Month`). */
  columnHeader: string;
  /** Visible summary (also the figure caption for screen readers). */
  summary: string;
  testId?: string;
}

const HEIGHT = 210;
const FALLBACK_WIDTH = 320;

function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function BarChart({ points, caption, columnHeader, summary, testId }: BarChartProps) {
  const { t } = useT();
  const f = useFormat();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const data = points.map((p) => ({ ...p, hours: p.minutes / 60 }));
  const tickFormatter = (v: number) => (Number.isInteger(v) ? f.number(v) : f.decimal1(v));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as BarPoint | undefined;
    if (!active || !point) return null;
    return <div className="chart-tip">{t('chart.bar.tooltip', { label: point.label, value: f.duration(point.minutes) })}</div>;
  };

  return (
    <>
      <figure className="chart-figure" data-testid={testId}>
        <div className="chart" ref={wrap} aria-hidden="true">
          <RBarChart width={width} height={HEIGHT} data={data} margin={{ top: 12, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="tick" interval="preserveStartEnd" minTickGap={8} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis width={34} tickLine={false} axisLine={false} tickFormatter={tickFormatter} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals />
            <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
            <Bar dataKey="hours" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={28}>
              {data.map((p) => (
                <Cell key={p.key} fill={p.current ? 'var(--primary)' : 'var(--chart-bar)'} />
              ))}
            </Bar>
          </RBarChart>
        </div>
        <figcaption className="muted small chart-sum">{summary}</figcaption>
      </figure>
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
    </>
  );
}
