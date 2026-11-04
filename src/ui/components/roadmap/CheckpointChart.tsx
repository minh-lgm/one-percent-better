// S13 checkpoint chart (phase 8, M20; DESIGN v8.0 S13 "Checkpoint", §5 `CheckpointChart`; FR-75). Plain SVG, no
// Recharts (Recharts stays in the Review chunk). Lazy-only (ADR-53). One column per checkpoint in date order; the
// axis is the raw score when every maximum is the same, otherwise % of each maximum (`chartScale`). Bar styles do
// not rely on colour: Passed = solid ink, Below = hatched danger, Recorded = solid accent, No score = dashed frame;
// the threshold is a dashed ink tick wider than the bar. The SVG is one `role="img"` with the summary as its name;
// the table next to it is the full data.
import { useId } from 'react';
import type { RoadmapCheckpoint } from '../../../domain/roadmap';
import { checkpointState, type ChartScale } from '../../../domain/roadmap-progress';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { formatPercent, formatScore } from './score';

export interface CheckpointChartProps {
  /** In date order. */
  points: readonly RoadmapCheckpoint[];
  scale: ChartScale;
}

/** Geometry in viewBox units (the SVG scales with its width; labels below use the same proportions). */
const SLOT = 64;
const BAR = 40;
const GUTTER = 40;
const PLOT = 140;
const TOP = 20;
const PENDING_H = 24;
/** More columns than this get a horizontal scroll inside the figure instead of shrinking under ~45 px. */
const MAX_FIT = 6;

export function CheckpointChart({ points, scale }: CheckpointChartProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const hatch = `cp-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (points.length === 0) return null;

  const n = points.length;
  const width = GUTTER + n * SLOT;
  const height = TOP + PLOT + 4;
  const rawMax = points[0]!.maxScore;
  const frac = (value: number, max: number) => Math.max(0, Math.min(1, value / max));
  const y = (fraction: number) => TOP + PLOT - fraction * PLOT;
  const tickLabel = (fraction: number) => (scale === 'raw' ? formatScore(f.locale, rawMax * fraction) : formatPercent(f.locale, fraction));

  const items = points.map((cp) => {
    const s = checkpointState(cp);
    const vars = { title: cp.title, max: formatScore(f.locale, cp.maxScore) };
    if (s.kind === 'pending') return t('cp.sr.pending', vars);
    const score = formatScore(f.locale, cp.score!);
    if (s.kind === 'recorded') return t('cp.sr.recorded', { ...vars, score });
    return t(s.kind === 'pass' ? 'cp.sr.pass' : 'cp.sr.below', { ...vars, score, threshold: formatScore(f.locale, cp.threshold!) });
  });
  const summary = t('cp.sr.intro', { count: n, items: items.join('; ') });
  const scrolls = n > MAX_FIT;

  return (
    <figure className="cp-chart" data-testid="cp-chart" data-scale={scale}>
      <figcaption>{t('cp.chartTitle')}</figcaption>
      <div className={scrolls ? 'cp-scroll scrolls' : 'cp-scroll'} tabIndex={scrolls ? 0 : undefined} role={scrolls ? 'group' : undefined} aria-label={scrolls ? t('cp.chartTitle') : undefined}>
        <div className="cp-plot" style={scrolls ? { minWidth: `${Math.round(width * 0.7)}px` } : undefined}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} data-testid="cp-svg">
            <defs>
              <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect className="cp-hatch-bg" width="6" height="6" />
                <line className="cp-hatch-line" x1="0" y1="0" x2="0" y2="6" />
              </pattern>
            </defs>
            {[0, 0.5, 1].map((fr) => (
              <g key={fr} className="cp-tick">
                <line className={fr === 0 ? 'cp-base' : 'cp-grid'} x1={GUTTER - 4} x2={width} y1={y(fr)} y2={y(fr)} />
                <text x={GUTTER - 8} y={y(fr) + 4} textAnchor="end">
                  {tickLabel(fr)}
                </text>
              </g>
            ))}
            {points.map((cp, k) => {
              const s = checkpointState(cp);
              const x = GUTTER + k * SLOT + (SLOT - BAR) / 2;
              const max = scale === 'raw' ? rawMax : cp.maxScore;
              const out = [];
              if (s.kind === 'pending') {
                out.push(<rect key="b" className="cp-bar pending" x={x} y={TOP + PLOT - PENDING_H} width={BAR} height={PENDING_H} rx={3} data-state="pending" />);
              } else {
                const top = y(frac(cp.score!, max));
                out.push(
                  <rect key="b" className={`cp-bar ${s.kind}`} x={x} y={top} width={BAR} height={TOP + PLOT - top} rx={3} style={s.kind === 'below' ? { fill: `url(#${hatch})` } : undefined} data-state={s.kind} data-height={((TOP + PLOT - top) / PLOT).toFixed(4)} />,
                  <text key="v" className="cp-v" x={x + BAR / 2} y={top - 5} textAnchor="middle">
                    {formatScore(f.locale, cp.score!)}
                  </text>,
                );
              }
              if (cp.threshold !== null) {
                const ty = y(frac(cp.threshold, max));
                out.push(<line key="t" className="cp-th" x1={x - 6} x2={x + BAR + 6} y1={ty} y2={ty} data-testid="cp-threshold-line" />);
              }
              return (
                <g key={cp.id} data-testid="cp-col" data-cp={cp.id}>
                  {out}
                </g>
              );
            })}
          </svg>
          <ol className="cp-labels" aria-hidden="true" style={{ gridTemplateColumns: `${GUTTER}fr repeat(${n}, ${SLOT}fr)` }}>
            <li />
            {points.map((cp) => (
              <li key={cp.id}>{cp.title}</li>
            ))}
          </ol>
        </div>
      </div>
      {scale === 'percent' ? (
        <p className="hint" data-testid="cp-scale-note">
          {t('cp.scalePercent')}
        </p>
      ) : null}
      <div className="cp-lgd" aria-hidden="true">
        <span>
          <i className="sw pass" />
          {t('cp.state.pass')}
        </span>
        <span>
          <i className="sw below" />
          {t('cp.state.below')}
        </span>
        <span>
          <i className="sw recorded" />
          {t('cp.state.recorded')}
        </span>
        <span>
          <i className="sw pending" />
          {t('cp.state.pending')}
        </span>
        <span>
          <i className="sw th" />
          {t('cp.legendThreshold')}
        </span>
      </div>
    </figure>
  );
}
