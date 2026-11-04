// S13 week strip — one cell per item (DESIGN v8.0 S13 "Dải ô", §8.4 "Dải ô", A-D87; FR-73). Lazy-only (ADR-53).
// `ul[role=list] > li > button`; roving tabindex (one tab stop), arrow keys / Home / End move between cells,
// Enter / Space (the button's click) scrolls to the item row and focuses it. State is never colour only: a tick,
// a "!", the index, and the state word in the accessible name.
import { useRef, useState, type KeyboardEvent } from 'react';
import { itemState, type ItemState } from '../../../domain/roadmap-progress';
import type { RoadmapItem } from '../../../domain/roadmap';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';

export interface WeekStripProps {
  /** In item order. */
  items: readonly RoadmapItem[];
  currentItemId: string | null;
  weekBased: boolean;
  today: string;
  onSelect: (itemId: string) => void;
}

const STATE_KEY: Record<ItemState, 'strip.state.done' | 'strip.state.overdue' | 'strip.state.upcoming'> = {
  done: 'strip.state.done',
  overdue: 'strip.state.overdue',
  upcoming: 'strip.state.upcoming',
  current: 'strip.state.upcoming', // replaced below: the "current" cell is only the `currentItemId` one
};

export function WeekStrip({ items, currentItemId, weekBased, today, onSelect }: WeekStripProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const listRef = useRef<HTMLUListElement>(null);
  // The one tab stop: the current item, else the first unfinished item, else the first cell (DESIGN §8.4).
  const defaultIndex = (() => {
    const cur = items.findIndex((i) => i.id === currentItemId);
    if (cur !== -1) return cur;
    const open = items.findIndex((i) => i.actualEnd === null);
    return open === -1 ? 0 : open;
  })();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabIndex = focusIndex ?? defaultIndex;

  const buttons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  /** Cells per row, measured from the layout (7 below 640 px, as many 44 px cells as fit above). */
  const columns = () => {
    const b = buttons();
    if (b.length < 2) return 1;
    const top = b[0].getBoundingClientRect().top;
    let n = 1;
    while (n < b.length && Math.abs(b[n].getBoundingClientRect().top - top) < 1) n += 1;
    return n;
  };
  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    setFocusIndex(next);
    buttons()[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target: number;
    switch (e.key) {
      case 'ArrowRight':
        target = index + 1;
        break;
      case 'ArrowLeft':
        target = index - 1;
        break;
      case 'ArrowDown':
        target = index + columns();
        break;
      case 'ArrowUp':
        target = index - columns();
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    moveFocus(target);
  };

  return (
    <section className="rd-sec" data-testid="week-strip">
      <ul className="rd-strip" role="list" aria-label={t('strip.label')} ref={listRef}>
        {items.map((item, index) => {
          const state = itemState(item, today);
          const isCurrent = item.id === currentItemId;
          const stateText = isCurrent && state !== 'done' && state !== 'overdue' ? t(weekBased ? 'strip.state.currentWeek' : 'strip.state.current') : t(STATE_KEY[state]);
          const cls = ['rd-cell', state === 'done' ? 'done' : state === 'overdue' ? 'over' : '', isCurrent ? 'cur' : ''].filter(Boolean).join(' ');
          return (
            <li key={item.id}>
              <button
                type="button"
                className={cls}
                data-testid="strip-cell"
                data-item={item.id}
                data-state={state}
                data-current={isCurrent || undefined}
                tabIndex={index === tabIndex ? 0 : -1}
                aria-label={t('strip.cell', { title: item.title, start: f.dayMonth(item.plannedStart), end: f.dayMonth(item.plannedEnd), state: stateText })}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
                onFocus={() => setFocusIndex(index)}
              >
                <span aria-hidden="true">
                  {state === 'done' ? (
                    <svg className="ic" viewBox="0 0 24 24" focusable="false">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : state === 'overdue' ? (
                    '!'
                  ) : (
                    f.number(index + 1)
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="rd-legend">
        <span>
          <i className="d" aria-hidden="true" />
          {t('strip.legend.done')}
        </span>
        <span>
          <i className="c" aria-hidden="true" />
          {weekBased ? t('strip.legend.current') : t('tag.currentItem')}
        </span>
        <span>
          <i className="o" aria-hidden="true" />
          {t('strip.legend.overdue')}
        </span>
      </div>
    </section>
  );
}
