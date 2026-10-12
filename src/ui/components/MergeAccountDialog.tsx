import { useEffect, useId, useRef } from 'react';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Button } from './Button';

export interface MergeAccountDialogProps {
  open: boolean;
  goals: number;
  entries: number;
  email: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * D5 — "Add this device's data to your account?" (DESIGN S7, F11, 8.1). Initial focus on Cancel
 * (nothing is uploaded until the user chooses); Esc = Cancel.
 */
export function MergeAccountDialog({ open, goals, entries, email, busy = false, onConfirm, onCancel }: MergeAccountDialogProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (!busy) onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel, busy]);

  return (
    <dialog ref={ref} className="dialog merge" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} aria-busy={busy || undefined} data-testid="merge-dialog">
      <div className="dialog-body">
        <h2 id={`${id}-title`}>{t('auth.merge.title')}</h2>
        <p id={`${id}-body`} className="merge-body">
          {t('auth.merge.body', { goals: f.count('format.goalsCount', goals), entries: f.count('format.entriesCount', entries), email })}
        </p>
        <p className="hint">{t('auth.merge.note')}</p>
      </div>
      <div className="actions">
        <Button variant="primary" onClick={onConfirm} disabled={busy} aria-busy={busy || undefined} data-testid="merge-confirm">
          {busy ? t('auth.merge.working') : t('auth.merge.confirm')}
        </Button>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </dialog>
  );
}
