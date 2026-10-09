import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../domain/types';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Badge } from './Badge';
import { Button, IconButton } from './Button';

export interface EntryRowProps {
  entry: LogEntry;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  /** Called after a delete so the parent can move focus (DESIGN §8). */
  onDeleted?: () => void;
  /** Show the Manual/Timer badge (Day screen, M3). */
  showSource?: boolean;
}

export function entrySummary(entry: Pick<LogEntry, 'minutes' | 'note'>, t: ReturnType<typeof useT>['t'], f: ReturnType<typeof useFormat>): string {
  const minutes = f.minutes(entry.minutes);
  return entry.note ? t('entry.row.summary', { minutes, note: entry.note }) : t('entry.row.summaryNoNote', { minutes });
}

/** One entry with Edit/Delete and inline delete confirmation (A-D5). */
export function EntryRow({ entry, onEdit, onDelete, onDeleted, showSource = false }: EntryRowProps) {
  const { t } = useT();
  const f = useFormat();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const summary = entrySummary(entry, t, f);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  if (confirming) {
    return (
      <li>
        <div className="confirm" role="group" aria-label={t('entry.row.confirmAria', { summary })}>
          <span>{t('entry.row.confirmTitle')}</span>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
                onDeleted?.();
              } finally {
                setBusy(false);
                setConfirming(false);
              }
            }}
          >
            {t('common.delete')}
          </Button>
          <Button
            variant="secondary"
            ref={keepRef}
            onClick={() => {
              setConfirming(false);
              requestAnimationFrame(() => deleteBtnRef.current?.focus());
            }}
          >
            {t('common.keep')}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <span className="em num">{f.minutes(entry.minutes)}</span>
      <span className="en">
        {entry.note}
        {showSource ? (
          <>
            {' '}
            <Badge>{t(`entry.source.${entry.source}`)}</Badge>
          </>
        ) : null}
      </span>
      <IconButton icon="edit" label={t('entry.row.editAria', { summary })} onClick={onEdit} />
      <IconButton icon="trash" label={t('entry.row.deleteAria', { summary })} onClick={() => setConfirming(true)} ref={deleteBtnRef} />
    </li>
  );
}
