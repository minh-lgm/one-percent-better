import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { HeatmapCell, HeatmapGrid } from '../../domain/heatmap';
import type { ISODate } from '../../domain/types';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

export interface HeatmapProps {
  grid: HeatmapGrid;
  mode: 'goal' | 'all';
  /** Goal name, or the "All goals" label, for the grid's accessible name. */
  goalName: string;
  onSelect: (date: ISODate) => void;
}

const ROWS = [0, 1, 2, 3, 4, 5, 6];
/** Weekday labels shown next to the grid (Mon/Wed/Fri like the mockup); the others stay for alignment. */
const VISIBLE_ROWS = new Set([0, 2, 4]);
/** Monday 2026-01-05 … Sunday 2026-01-11: a week used only to format weekday names. */
const WEEKDAY_SAMPLE = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];
/** Month labels closer than this many columns (< 40 px) to the previous one are skipped (DESIGN §3.4). */
const MIN_LABEL_COLS = 3;

interface Tip {
  text: string;
  left: number;
  top: number;
}

/**
 * Year heatmap (DESIGN S6, §8): CSS grid, `role="grid"`, one roving tab stop,
 * arrow keys move by week/day, Enter/Space opens the Day screen, tooltip on hover/focus.
 */
export function Heatmap({ grid, mode, goalName, onSelect }: HeatmapProps) {
  const { t } = useT();
  const f = useFormat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<ISODate, HTMLDivElement>());
  const [focusDate, setFocusDate] = useState<ISODate>(() => grid.cells[grid.focusIndex].date);
  const [tip, setTip] = useState<Tip | null>(null);

  const byDate = useMemo(() => new Map(grid.cells.map((c) => [c.date, c])), [grid]);
  const byPosition = useMemo(() => new Map(grid.cells.map((c) => [`${c.col}:${c.row}`, c])), [grid]);
  const rows = useMemo(
    () =>
      ROWS.map((row) => {
        const cells: Array<HeatmapCell | null> = [];
        for (let col = 0; col < grid.columns; col++) cells.push(byPosition.get(`${col}:${row}`) ?? null);
        return cells;
      }),
    [grid.columns, byPosition],
  );

  // A new year/goal resets the tab stop (the previous date may not exist in the new grid).
  const activeDate = byDate.has(focusDate) ? focusDate : grid.cells[grid.focusIndex].date;

  // Mobile: scroll the current week into view when the grid changes (DESIGN S6).
  useEffect(() => {
    const scroller = scrollRef.current;
    const target = cellRefs.current.get(grid.cells[grid.focusIndex].date);
    if (!scroller || !target) return;
    if (scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = Math.max(0, target.offsetLeft + target.offsetWidth - scroller.clientWidth + 48);
    } else {
      scroller.scrollLeft = 0;
    }
  }, [grid]);

  const cellName = (cell: HeatmapCell): string => {
    const date = f.dateLong(cell.date, { withYear: true });
    if (cell.state === 'future') return t('heatmap.cell.future', { date });
    if (cell.state === 'outside') return t('heatmap.cell.outside', { date });
    if (cell.state === 'none') return t('heatmap.cell.none', { date });
    const minutes = f.minutes(cell.minutes);
    if (mode === 'goal') return t(cell.met ? 'heatmap.cell.goalMet' : 'heatmap.cell.goalNotMet', { date, minutes });
    return t(cell.met ? 'heatmap.cell.all' : 'heatmap.cell.allNotMet', { date, minutes });
  };

  const showTip = (cell: HeatmapCell, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const width = typeof window === 'undefined' ? 0 : window.innerWidth;
    const left = width ? Math.min(Math.max(box.left + box.width / 2, 135), width - 135) : box.left;
    setTip({ text: cellName(cell), left, top: box.top - 8 });
  };

  const moveFocus = (next: HeatmapCell | null | undefined) => {
    if (!next) return;
    setFocusDate(next.date);
    cellRefs.current.get(next.date)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, cell: HeatmapCell) => {
    let next: HeatmapCell | null | undefined;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (cell.navigable) onSelect(cell.date);
        return;
      case 'ArrowRight':
        next = byPosition.get(`${cell.col + 1}:${cell.row}`);
        break;
      case 'ArrowLeft':
        next = byPosition.get(`${cell.col - 1}:${cell.row}`);
        break;
      case 'ArrowDown':
        next = cell.row === 6 ? byPosition.get(`${cell.col + 1}:0`) : byPosition.get(`${cell.col}:${cell.row + 1}`);
        break;
      case 'ArrowUp':
        next = cell.row === 0 ? byPosition.get(`${cell.col - 1}:6`) : byPosition.get(`${cell.col}:${cell.row - 1}`);
        break;
      case 'Home':
        next = grid.cells[0];
        break;
      case 'End':
        next = grid.cells[grid.cells.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    moveFocus(next);
  };

  const monthLabels: Array<{ col: number; text: string }> = [];
  let lastLabelCol = -MIN_LABEL_COLS;
  for (const m of grid.months) {
    if (m.col - lastLabelCol < MIN_LABEL_COLS) continue;
    monthLabels.push({ col: m.col, text: f.monthShort(m.date) });
    lastLabelCol = m.col;
  }
  const columnsStyle = { gridTemplateColumns: `repeat(${grid.columns}, var(--cell))` };

  return (
    <>
      <div className="hm-wrap">
        <div className="hm-days" aria-hidden="true">
          {ROWS.map((row) => (
            <span key={row} className={VISIBLE_ROWS.has(row) ? undefined : 'hm-day-hidden'} data-testid="heatmap-weekday">
              {f.weekdayShort(WEEKDAY_SAMPLE[row])}
            </span>
          ))}
        </div>
        <div className="hm-scroll" ref={scrollRef} data-testid="heatmap-scroll">
          <div className="hm-months" aria-hidden="true" style={columnsStyle}>
            {monthLabels.map((m) => (
              <span key={m.col} style={{ gridColumn: m.col + 1 }} data-testid="heatmap-month">
                {m.text}
              </span>
            ))}
          </div>
          <div className="heatmap" role="grid" aria-label={t('heatmap.aria', { year: String(grid.year), goal: goalName })} aria-rowcount={7} aria-colcount={grid.columns} data-testid="heatmap">
            {rows.map((cells, row) => (
              <div key={row} role="row" className="hm-row" style={columnsStyle}>
                {cells.map((cell, col) =>
                  cell ? (
                    <div
                      key={cell.date}
                      ref={(el) => {
                        if (el) cellRefs.current.set(cell.date, el);
                        else cellRefs.current.delete(cell.date);
                      }}
                      role="gridcell"
                      className={`cell ${cell.state === 'future' ? 'fut' : cell.state === 'outside' ? 'out' : `l${cell.level}`}${cell.today ? ' today' : ''}`}
                      tabIndex={cell.date === activeDate ? 0 : -1}
                      aria-label={cellName(cell)}
                      aria-disabled={cell.navigable ? undefined : true}
                      data-date={cell.date}
                      onClick={() => {
                        setFocusDate(cell.date);
                        if (cell.navigable) onSelect(cell.date);
                      }}
                      onKeyDown={(e) => onKeyDown(e, cell)}
                      onFocus={(e) => showTip(cell, e.currentTarget)}
                      onBlur={() => setTip(null)}
                      onMouseEnter={(e) => showTip(cell, e.currentTarget)}
                      onMouseLeave={() => setTip(null)}
                    />
                  ) : (
                    <span key={`pad-${col}`} className="cell sp" aria-hidden="true" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="hm-legend">
        <span>{t('heatmap.legendLess')}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`sw l${level}`} aria-hidden="true" />
        ))}
        <span>{t('heatmap.legendMore')}</span>
        <span className="hm-legend-note">{t(mode === 'all' ? 'heatmap.legendAll' : 'heatmap.legendGoal')}</span>
      </div>
      <div className="hm-tip" role="tooltip" hidden={!tip} style={tip ? { left: tip.left, top: tip.top } : undefined} data-testid="heatmap-tooltip">
        {tip?.text}
      </div>
    </>
  );
}
