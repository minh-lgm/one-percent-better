// Recharts bar chart (DESIGN §5 BarChart, §8). This module is only ever loaded
// through `lazy(() => import(...))` from the Review screen (ADR-10), so Recharts
// stays out of the initial bundle (NFR-03).
import { useRef } from 'react';
import { Bar, BarChart as RBarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useElementWidth } from '../hooks/useRechartsWidth';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { BarChartTable } from './BarChartTable';

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
/** Y axis width + right margin: the plot is `chartWidth − 38` wide (DESIGN S6 "Nhãn giá trị trên cột BarChart"). */
const Y_AXIS_WIDTH = 34;
const RIGHT_MARGIN = 4;
/** Labels need at least this many px per column; both charts have 12 columns, so `chartWidth ≥ 398`. */
const LABEL_MIN_SLOT_PX = 30;
const LABEL_COLUMNS = 12;
/** Columns under 3 minutes get no label (they would round to 0.0). */
const LABEL_MIN_MINUTES = 3;
/** Top margin ≥ 20 px so the label of the tallest column is not clipped. */
const TOP_MARGIN = 20;

/** DESIGN S6 rule 1: value labels only when every column has ≥ 30 px. */
export function barLabelsFit(chartWidth: number): boolean {
  return (chartWidth - Y_AXIS_WIDTH - RIGHT_MARGIN) / LABEL_COLUMNS >= LABEL_MIN_SLOT_PX;
}

export default function BarChart({ points, caption, columnHeader, summary, testId }: BarChartProps) {
  const { t } = useT();
  const f = useFormat();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrap);
  const data = points.map((p) => ({ ...p, hours: p.minutes / 60 }));
  const tickFormatter = (v: number) => (Number.isInteger(v) ? f.number(v) : f.decimal1(v));
  const showLabels = barLabelsFit(width);
  // DESIGN S6 rule 3: hours without a unit; one decimal under 100 h, whole numbers from 100 h.
  const labelText = (hours: number) => (hours < 100 ? f.decimal1(hours) : f.number(Math.round(hours)));
  // Recharts only renders (and labels) non-empty bars, so `index` counts rendered bars; the label's
  // `value` is the point key instead (dataKey function below) and the point is looked up by it.
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) => {
    const p = data.find((d) => d.key === props.value);
    if (!p || p.minutes < LABEL_MIN_MINUTES) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    const y = Number(props.y) - 4;
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={11} fontWeight={600} fill={p.current ? 'var(--text)' : 'var(--text-muted)'} data-testid="bar-value">
        {labelText(p.hours)}
      </text>
    );
  };

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as BarPoint | undefined;
    if (!active || !point) return null;
    return <div className="chart-tip">{t('chart.bar.tooltip', { label: point.label, value: f.duration(point.minutes) })}</div>;
  };

  return (
    <>
      <figure className="chart-figure" data-testid={testId}>
        <div className="chart" ref={wrap} aria-hidden="true">
          <RBarChart width={width} height={HEIGHT} data={data} margin={{ top: TOP_MARGIN, right: RIGHT_MARGIN, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="tick" interval="preserveStartEnd" minTickGap={8} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis width={Y_AXIS_WIDTH} tickLine={false} axisLine={false} tickFormatter={tickFormatter} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals />
            <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
            <Bar dataKey="hours" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={28}>
              {data.map((p) => (
                <Cell key={p.key} fill={p.current ? 'var(--primary)' : 'var(--chart-bar)'} />
              ))}
              {showLabels ? <LabelList dataKey={(p: BarPoint) => p.key} content={renderLabel} /> : null}
            </Bar>
          </RBarChart>
        </div>
        <figcaption className="muted small chart-sum">{summary}</figcaption>
      </figure>
      <BarChartTable points={points} caption={caption} columnHeader={columnHeader} />
    </>
  );
}
