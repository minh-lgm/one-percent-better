// S13 checkpoint table (phase 8, M20; DESIGN v8.0 S13 "Checkpoint", §5 `CheckpointTable`; FR-75, A-91). Lazy-only
// (ADR-53). A real <table>: name + week of the roadmap (or the full date outside it) + note | threshold | quick score
// input (saved on blur or Enter, locale decimal, cleared → no score) with the state line and the signed delta.
import { useState, type KeyboardEvent } from 'react';
import type { RoadmapCheckpoint } from '../../../domain/roadmap';
import { checkpointState } from '../../../domain/roadmap-progress';
import { Icon } from '../Icon';
import { useFormat } from '../../hooks/useFormat';
import { useT } from '../../hooks/useT';
import { formatScore, parseScore, scoreInputValue, signedScore } from './score';
import { useRoadmapErrors, type UiError } from './useRoadmapErrors';

export interface CheckpointTableProps {
  /** In date order (`sortCheckpoints`). */
  checkpoints: readonly RoadmapCheckpoint[];
  /** Week of the roadmap containing the date (A-91), `null` outside the roadmap. */
  weekOf: (date: string) => number | null;
  /** Save one score (`null` = clear). Resolves with the error to show under the input, or `null` when saved. */
  onScore: (checkpoint: RoadmapCheckpoint, score: number | null) => Promise<UiError | null>;
}

export function CheckpointTable({ checkpoints, weekOf, onScore }: CheckpointTableProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  return (
    <table className="cp-table" data-testid="cp-table">
      <thead>
        <tr>
          <th scope="col">{t('cp.colName')}</th>
          <th scope="col">{t('cp.colThreshold')}</th>
          <th scope="col">{t('cp.colScore')}</th>
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((cp) => {
          const week = weekOf(cp.date);
          return (
            <tr key={cp.id} data-testid="cp-row" data-cp={cp.id}>
              <td>
                <div className="cp-n">{cp.title}</div>
                <div className="cp-w num" data-testid="cp-when">
                  {week === null ? f.dateShort(cp.date) : t('cp.week', { n: f.number(week) })}
                </div>
                {cp.note ? (
                  <div className="cp-note" data-testid="cp-note">
                    {cp.note}
                  </div>
                ) : null}
              </td>
              <td className="num" data-testid="cp-threshold">
                {cp.threshold === null ? t('noValue') : t('cp.threshold', { value: formatScore(f.locale, cp.threshold) })}
              </td>
              <td>
                <ScoreCell checkpoint={cp} onScore={onScore} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScoreCell({ checkpoint: cp, onScore }: { checkpoint: RoadmapCheckpoint; onScore: CheckpointTableProps['onScore'] }) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const shown = scoreInputValue(f.locale, cp.score);
  // The draft follows the stored score whenever that changes (save, sync, another tab) — derived in render, not in an
  // effect, so the input never shows the old value for a frame and focus is never lost (M19 deviation 5).
  const [synced, setSynced] = useState(shown);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<UiError | null>(null);
  if (synced !== shown) {
    setSynced(shown);
    setText(shown);
    setError(null);
  }

  const commit = async () => {
    if (text.trim() === shown) {
      setError(null);
      return;
    }
    const value = parseScore(text);
    const err = await onScore(cp, value);
    setError(err);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
  };

  const state = checkpointState(cp);
  const inputId = `cp-score-${cp.id}`;
  const errId = `${inputId}-err`;
  const max = formatScore(f.locale, cp.maxScore);
  return (
    <>
      <div className="cp-score">
        <input
          id={inputId}
          className="input"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-label={t('cp.scoreAria', { title: cp.title, max })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          data-testid="cp-score"
        />
        <span className="cp-max" aria-hidden="true">
          {t('cp.outOf', { max })}
        </span>
      </div>
      {error ? (
        <p id={errId} className="err" role="alert">
          <Icon name="alert" />
          <span>{errorText(error)}</span>
        </p>
      ) : null}
      <div className={`cp-st ${state.kind}`} data-testid="cp-state" data-state={state.kind}>
        <span>{t(`cp.state.${state.kind}`)}</span>
        {state.kind === 'pass' || state.kind === 'below' ? (
          <span className="cp-dl num" data-testid="cp-delta">
            {signedScore(f.locale, state.delta)}
          </span>
        ) : null}
      </div>
    </>
  );
}
