import { useEffect, useRef } from 'react';
import { useT } from '../hooks/useT';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native `<dialog>` + showModal(); initial focus on Cancel (DESIGN §5, §8). */
export function ConfirmDialog({ open, title, body, confirmLabel, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useT();
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
      onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" aria-describedby="confirm-body">
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-body">{body}</p>
      <div className="actions">
        <Button variant="danger" onClick={onConfirm} disabled={busy} aria-busy={busy || undefined}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} ref={cancelRef}>
          {t('common.cancel')}
        </Button>
      </div>
    </dialog>
  );
}
