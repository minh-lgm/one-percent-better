// Recharts line chart for the 1% curve (DESIGN S4, §5 CurveChart, §8). Loaded
// only through `lazy(() => import(...))` from the Goal detail screen, so Recharts
// stays out of the initial bundle (ADR-10, NFR-03). The data table and the text
// summary live in the screen (no chart dependency); this component only draws
// the SVG, the hover tooltip and the keyboard "reading" of one point.
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { ActualPoint, IdealPoint } from '../../domain/curve';
import { growthPercent } from '../../domain/curve';
import { useElementWidth } from '../hooks/useRechartsWidth';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

export interface CurveChartProps {
  /** Ideal points to draw (already cut to the selected range). */
  ideal: IdealPoint[];
  /** Actual points (never longer than `ideal`). */
  actual: ActualPoint[];
  /** Accessible name of the chart (the text summary). */
  label: string;
  testId?: string;
}

interface ChartPoint {
  date: string;
  k: number;
  ideal: number;
  you?: number;
}

const MARGIN = { top: 28, right: 24, bottom: 4, left: 0 };

export default function CurveChart({ ideal, actual, label, testId }: CurveChartProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrap);
  const height = width < 520 ? 240 : 320;
  const [reading, setReading] = useState<number | null>(null);

  const data: ChartPoint[] = ideal.map((p, i) => {
    const a = actual[i];
    return { date: p.date, k: p.k, ideal: growthPercent(p.value), you: a ? growthPercent(a.value) : undefined };
  });
  const last = actual.length > 0 ? actual[actual.length - 1] : null;
  const todayPoint = last ? data[actual.length - 1] : null;
  const labelOnLeft = last ? actual.length / Math.max(1, data.length) > 0.7 : false;

  const pct = (v: number) => t('format.percent', { value: `+${f.decimal1(v)}` });
  const tipText = (p: ChartPoint) => (p.you === undefined ? t('goal.detail.tooltipIdeal', { date: f.dateMonthDay(p.date), ideal: f.decimal1(p.ideal) }) : t('goal.detail.tooltip', { date: f.dateMonthDay(p.date), ideal: f.decimal1(p.ideal), you: f.decimal1(p.you) }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as ChartPoint | undefined;
    if (!active || !point) return null;
    return <div className="chart-tip">{tipText(point)}</div>;
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (data.length === 0) return;
    // First arrow press reads today's point (or the first one); later presses move by one day.
    const start = todayPoint ? actual.length - 1 : 0;
    const lastIndex = data.length - 1;
    const next = (): number | null | undefined => {
      switch (e.key) {
        case 'ArrowRight':
          return reading === null ? start : Math.min(lastIndex, reading + 1);
        case 'ArrowLeft':
          return reading === null ? start : Math.max(0, reading - 1);
        case 'Home':
          return 0;
        case 'End':
          return lastIndex;
        case 'Escape':
          return null;
        default:
          return undefined;
      }
    };
    const target = next();
    if (target === undefined) return;
    e.preventDefault();
    setReading(target);
  }

  const readingText = reading !== null && data[reading] ? tipText(data[reading]) : '';

  return (
    <>
      <div
        className="chart curve-chart"
        ref={wrap}
        role="img"
        aria-label={label}
        aria-describedby={`${id}-reading`}
        tabIndex={0}
        data-testid={testId}
        onKeyDown={onKeyDown}
        onBlur={() => setReading(null)}
      >
        <div aria-hidden="true">
          <LineChart width={width} height={height} data={data} margin={MARGIN} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={(d: string) => f.dateMonthDay(d)} interval="preserveStartEnd" minTickGap={48} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={(v: number) => pct(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={[0, 'auto']} />
            <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '2 3' }} isAnimationActive={false} active={reading !== null ? true : undefined} defaultIndex={reading ?? undefined} />
            <Line type="linear" dataKey="ideal" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 4, fill: 'var(--surface)', stroke: 'var(--text-muted)' }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="you" stroke="var(--primary)" strokeWidth={3.5} dot={false} activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--surface)' }} isAnimationActive={false} connectNulls={false} />
            {todayPoint ? (
              <>
                <ReferenceLine x={todayPoint.date} stroke="var(--text-muted)" strokeDasharray="2 3" />
                <ReferenceDot x={todayPoint.date} y={todayPoint.ideal} r={4.5} fill="var(--surface)" stroke="var(--text-muted)" strokeWidth={2} label={{ value: t('goal.detail.labelIdeal', { value: f.decimal1(todayPoint.ideal) }), position: labelOnLeft ? 'left' : 'right', fill: 'var(--text-muted)', fontSize: 12, fontWeight: 600, dy: -10 }} />
                <ReferenceDot x={todayPoint.date} y={todayPoint.you ?? 0} r={5.5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} label={{ value: t('goal.detail.labelYou', { value: f.decimal1(todayPoint.you ?? 0) }), position: labelOnLeft ? 'left' : 'right', fill: 'var(--primary)', fontSize: 12, fontWeight: 700, dy: 14 }} />
              </>
            ) : null}
          </LineChart>
        </div>
      </div>
      <p id={`${id}-reading`} className="chart-reading muted small num" aria-live="polite" aria-atomic="true" data-testid="curve-reading">
        {readingText}
      </p>
    </>
  );
}
