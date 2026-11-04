// Pace chip of a roadmap (DESIGN S11 "Chip nhịp độ", phase 8). Lazy-only (ADR-53): the icons are inline here so
// nothing is added to the cold-load Icon set. Colour is never the only channel: each level has its own icon and text.
import type { ReactNode } from 'react';
import type { Pace } from '../../../domain/roadmap-progress';
import { useT, type RoadmapTFn } from '../../hooks/useT';

const ICONS: Record<Pace['severity'], ReactNode> = {
  good: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  idle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warn: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  crit: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </>
  ),
};

export function paceLabel(t: RoadmapTFn, pace: Pace): string {
  switch (pace.kind) {
    case 'notStarted':
      return t('pace.notStarted');
    case 'onTrack':
      return t('pace.onTrack');
    case 'completed':
      return t('pace.completed');
    case 'empty':
      return t('pace.empty');
    case 'behind':
      return t(pace.weekBased ? 'pace.behindWeeks' : 'pace.behindItems', { count: pace.overdueCount });
  }
}

export function PaceChip({ pace }: { pace: Pace }) {
  const { t } = useT('roadmap');
  return (
    <span className={`rm-chip ${pace.severity}`} data-testid="pace-chip" data-pace={pace.kind}>
      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {ICONS[pace.severity]}
      </svg>
      {paceLabel(t, pace)}
    </span>
  );
}
