import { useId, useRef, useState, type Ref } from 'react';
import { clockTime, elapsedMs } from '../../domain/timer';
import type { Goal, ISODateTime } from '../../domain/types';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import { Badge } from './Badge';
import { Button } from './Button';

export interface TimerCardProps {
  goal: Goal;
  startedAt: ISODateTime;
  /** Called with the Stop button so focus can return to it after "Keep running". */
  onStop: (opener: HTMLButtonElement) => void;
  stopRef?: Ref<HTMLButtonElement>;
  busy?: boolean;
}

/** Pinned card for the running timer (DESIGN S1, mockup 04). Elapsed = now − startedAt, re-rendered every second. */
export function TimerCard({ goal, startedAt, onStop, stopRef, busy = false }: TimerCardProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const now = useNow(1000);
  const elapsed = f.hhmmss(elapsedMs(startedAt, now));
  // The Stop button's accessible name is frozen while it has focus (DESIGN §8),
  // so screen readers do not re-announce it every second.
  const [frozen, setFrozen] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <section className="card timer" aria-labelledby={`${id}-title`} data-testid="timer-card">
      <div className="row">
        <h2 id={`${id}-title`}>{t('timer.cardTitle', { goal: goal.name })}</h2>
        <Badge tone="success">{t('timer.badge')}</Badge>
      </div>
      <p className="clock num" role="timer" aria-label={t('timer.elapsedLabel')} data-testid="timer-elapsed">
        {elapsed}
      </p>
      <p className="muted small num">{t('timer.startedAt', { time: clockTime(startedAt) })}</p>
      <Button
        variant="primary"
        icon="stop"
        ref={(el) => {
          buttonRef.current = el;
          if (typeof stopRef === 'function') stopRef(el);
          else if (stopRef) stopRef.current = el;
        }}
        aria-label={t('timer.stopAria', { goal: goal.name, elapsed: frozen ?? elapsed })}
        onFocus={() => setFrozen(elapsed)}
        onBlur={() => setFrozen(null)}
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={(e) => onStop(e.currentTarget)}
      >
        {t('timer.stop')}
      </Button>
    </section>
  );
}
