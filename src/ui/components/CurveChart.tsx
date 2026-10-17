// Recharts line chart for the 1% curve v3 (FR-27 v3.0; DESIGN S4 "Biểu đồ v3", §5 CurveChart,
// §8). Loaded only through `lazy(() => import(...))` from the Goal detail screen, so Recharts
// stays out of the initial bundle (ADR-10, NFR-03). The data table and the text summary live
// in the screen (no chart dependency); this component only draws the SVG, the hover tooltip
// and the keyboard "reading" of one point.
//
// "You" is `ActualPoint.percent` drawn as steps (`stepAfter`): flat over days without time,
// down when a day has less than the previous logged day; not drawn at all before the first
// logged day exists. The Y domain comes from `curveYScale` over the points on screen, with a
// solid 0 % reference line (= the first logged day).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { ActualPoint, IdealPoint } from '../../domain/curve';
import { curveYScale, growthPercent } from '../../domain/curve';
import { useElementWidth } from '../hooks/useRechartsWidth';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

export interface CurveChartProps {
  /** Ideal points to draw (already cut to the selected range). */
  ideal: IdealPoint[];
  /** Actual points (startDate → last elapsed day; may be longer than `ideal` under "So far" — extra points are ignored). */
  actual: ActualPoint[];
  /** Accessible name of the chart (the text summary). */
  label: string;
  testId?: string;
}

interface ChartPoint {
  date: string;
  k: number;
  /** Ideal %, one decimal. */
  ideal: number;
  /** You %; undefined on future days and when nothing has been logged yet. */
  you?: number;
  minutes: number;
  logged: boolean;
  change: number | null;
}

const MARGIN = { top: 28, right: 24, bottom: 4, left: 0 };
/** Fixed so the direct-label layout below can use the same geometry as Recharts. */
const X_AXIS_HEIGHT = 30;
/** Small dots on logged days only while the You line has at most this many points on screen (DESIGN rule 1). */
const MAX_POINTS_WITH_DOTS = 45;
/** Direct labels closer than this (px) are pushed to opposite sides of their dots (DESIGN rule 5). */
const LABEL_CLEARANCE = 24;
const LABEL_ABOVE_DY = -10;
const LABEL_BELOW_DY = 14;
/**
 * M9-D1: when a mouse press elsewhere blurs the chart, the reading line must not vanish (and shift
 * the layout) before that click lands. The line is cleared right after the next click, or after
 * this delay when no click follows (Tab away). Keyboard behaviour (Escape clears at once) is unchanged.
 */
export const BLUR_CLEAR_DELAY_MS = 300;

export default function CurveChart({ ideal, actual, label, testId }: CurveChartProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrap);
  const height = width < 520 ? 240 : 320;
  const [reading, setReading] = useState<number | null>(null);
  const blurCleanup = useRef<(() => void) | null>(null);

  const cancelPendingBlur = () => {
    blurCleanup.current?.();
    blurCleanup.current = null;
  };
  useEffect(() => cancelPendingBlur, []);

  function onBlur() {
    cancelPendingBlur();
    const clear = () => {
      cancelPendingBlur();
      setReading(null);
    };
    // After the click has been dispatched (its default action, e.g. toggling <details>, has run).
    const afterClick = () => {
      window.setTimeout(clear, 0);
    };
    const timer = window.setTimeout(clear, BLUR_CLEAR_DELAY_MS);
    document.addEventListener('click', afterClick, { once: true });
    blurCleanup.current = () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', afterClick);
    };
  }

  // No baseline yet → no You line, no You label, Ideal-only tooltips (DESIGN A-D37).
  const hasYou = actual.some((p) => p.logged);
  const shown = Math.min(actual.length, ideal.length);
  const data: ChartPoint[] = ideal.map((p, i) => {
    const a = i < shown ? actual[i] : undefined;
    return {
      date: p.date,
      k: p.k,
      ideal: growthPercent(p.value),
      you: hasYou && a ? a.percent : undefined,
      minutes: a?.minutes ?? 0,
      logged: a?.logged ?? false,
      change: a?.changePercent ?? null,
    };
  });
  const todayPoint = shown > 0 ? data[shown - 1] : null;
  const labelOnLeft = todayPoint ? shown / Math.max(1, data.length) > 0.7 : false;

  // Y scale over the points on screen (ARCH §4.5; DESIGN rule 3/4).
  const scale = curveYScale(
    data.map((p) => p.ideal),
    hasYou ? data.slice(0, shown).map((p) => p.you ?? 0) : [],
  );
  const [lo, hi] = scale.domain;
  const longestTick = Math.max(...scale.ticks.map((v) => f.axisPercent(v).length));
  const yAxisWidth = Math.max(44, Math.round(6.6 * longestTick + 14));

  // Direct labels (DESIGN rule 5): above the dot by default, below when they would hit the top
  // of the plot; when the two dots are close, the higher series goes above and the lower below.
  const plotTop = MARGIN.top;
  const plotHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT);
  const yPixel = (v: number) => plotTop + ((hi - v) / Math.max(1e-9, hi - lo)) * plotHeight;
  const aboveOrBelow = (y: number) => (y - 9 < plotTop + 8 ? LABEL_BELOW_DY : LABEL_ABOVE_DY);
  let idealDy = LABEL_ABOVE_DY;
  let youDy = LABEL_ABOVE_DY;
  if (todayPoint) {
    const yI = yPixel(todayPoint.ideal);
    idealDy = aboveOrBelow(yI);
    if (todayPoint.you !== undefined) {
      const yY = yPixel(todayPoint.you);
      youDy = aboveOrBelow(yY);
      if (Math.abs(yI - yY) < LABEL_CLEARANCE) {
        // Smaller pixel y = higher on screen.
        if (yI < yY) {
          idealDy = LABEL_ABOVE_DY;
          youDy = LABEL_BELOW_DY;
        } else {
          youDy = LABEL_ABOVE_DY;
          idealDy = LABEL_BELOW_DY;
        }
      }
    }
  }

  const tipText = (p: ChartPoint) => {
    const base = { date: f.dateMonthDay(p.date), ideal: f.signed1(p.ideal) };
    if (p.you === undefined) return t('goal.detail.tooltipIdeal', base);
    const you = { ...base, you: f.signed1(p.you), minutes: f.minutes(p.minutes) };
    if (!p.logged) return t('goal.detail.tooltipFlat', you);
    if (p.change === null) return t('goal.detail.tooltipBase', you);
    return t('goal.detail.tooltipChange', { ...you, change: f.signed1(p.change) });
  };

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as ChartPoint | undefined;
    if (!active || !point) return null;
    return <div className="chart-tip">{tipText(point)}</div>;
  };

  const withDots = hasYou && shown <= MAX_POINTS_WITH_DOTS;
  const loggedDot = (props: { cx?: number; cy?: number; payload?: unknown }) => {
    const p = props.payload as ChartPoint | undefined;
    if (!withDots || !p?.logged || props.cx === undefined || props.cy === undefined) return null;
    return <circle className="curve-dot" cx={props.cx} cy={props.cy} r={3} fill="var(--chart-actual)" stroke="var(--surface)" strokeWidth={1.5} />;
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (data.length === 0) return;
    // First arrow press reads today's point (or the first one); later presses move by one day.
    const start = todayPoint ? shown - 1 : 0;
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
    cancelPendingBlur();
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
        data-y-min={lo}
        data-y-max={hi}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onFocus={cancelPendingBlur}
      >
        <div aria-hidden="true">
          <LineChart width={width} height={height} data={data} margin={MARGIN} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" height={X_AXIS_HEIGHT} tickFormatter={(d: string) => f.dateMonthDay(d)} interval="preserveStartEnd" minTickGap={48} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis width={yAxisWidth} tickLine={false} axisLine={false} domain={scale.domain} ticks={scale.ticks} interval={0} tickFormatter={(v: number) => f.axisPercent(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <ReferenceLine y={0} className="zero-line" stroke="var(--chart-zero)" strokeWidth={1.5} ifOverflow="extendDomain" />
            <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '2 3' }} isAnimationActive={false} active={reading !== null ? true : undefined} defaultIndex={reading ?? undefined} />
            <Line type="linear" dataKey="ideal" stroke="var(--chart-ideal)" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 4, fill: 'var(--surface)', stroke: 'var(--text-muted)' }} isAnimationActive={false} />
            {hasYou ? <Line type="stepAfter" dataKey="you" stroke="var(--chart-actual)" strokeWidth={3.5} dot={loggedDot} activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--surface)' }} isAnimationActive={false} connectNulls={false} /> : null}
            {todayPoint ? (
              <>
                <ReferenceLine x={todayPoint.date} stroke="var(--text-muted)" strokeDasharray="2 3" />
                <ReferenceDot x={todayPoint.date} y={todayPoint.ideal} r={4.5} fill="var(--surface)" stroke="var(--text-muted)" strokeWidth={2} label={{ value: t('goal.detail.labelIdeal', { value: f.signed1(todayPoint.ideal) }), position: labelOnLeft ? 'left' : 'right', fill: 'var(--text-muted)', fontSize: 12, fontWeight: 600, dy: idealDy }} />
                {todayPoint.you !== undefined ? (
                  <ReferenceDot x={todayPoint.date} y={todayPoint.you} r={5.5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} label={{ value: t('goal.detail.labelYou', { value: f.signed1(todayPoint.you) }), position: labelOnLeft ? 'left' : 'right', fill: 'var(--primary)', fontSize: 12, fontWeight: 700, dy: youDy }} />
                ) : null}
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
