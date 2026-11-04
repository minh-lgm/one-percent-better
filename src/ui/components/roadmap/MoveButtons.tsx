// Up / down reorder buttons of S14 (DESIGN v8.0 S14 "Sắp xếp bằng nút", §8.4; FR-74, ADR-51, A-D84). Lazy-only.
// `aria-disabled` at the ends (still focusable, no-op); the ids let the editor put focus back on the very button that
// was pressed after the row moved (focus follows the item, not the index).
import { Icon } from '../Icon';
import { useT } from '../../hooks/useT';

export interface MoveButtonsProps {
  /** Row id, used for the button ids `mv-up-{id}` / `mv-down-{id}`. */
  id: string;
  title: string;
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
}

export const moveButtonId = (id: string, dir: -1 | 1) => `mv-${dir === -1 ? 'up' : 'down'}-${id}`;

export function MoveButtons({ id, title, index, count, onMove }: MoveButtonsProps) {
  const { t } = useT('roadmap');
  const first = index === 0;
  const last = index === count - 1;
  return (
    <>
      <button type="button" id={moveButtonId(id, -1)} className="icon-btn re-mv" aria-label={t('ed.moveUpAria', { title })} aria-disabled={first || undefined} onClick={() => !first && onMove(-1)}>
        <Icon name="up" />
      </button>
      <button type="button" id={moveButtonId(id, 1)} className="icon-btn re-mv down" aria-label={t('ed.moveDownAria', { title })} aria-disabled={last || undefined} onClick={() => !last && onMove(1)}>
        <Icon name="up" />
      </button>
    </>
  );
}
