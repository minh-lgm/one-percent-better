import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { WRITE_FAILED_KEY } from '../error-messages';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';
import { Alert } from './Alert';
import { Button } from './Button';
import { Icon } from './Icon';

export interface SignOutChoice {
  keepData: boolean;
  /** Remove confirmed again after the final sync failed (DESIGN D4 "Remove anyway"). */
  removeAnyway?: boolean;
}

export interface SignOutDialogProps {
  open: boolean;
  busy?: boolean;
  /** Removing local data failed: the dialog stays open with `errors.WRITE_FAILED`. */
  writeFailed?: boolean;
  /** M7: changes not yet in the account (FR-41 warning block). */
  pending?: number;
  /** M7-D5: rows the cloud refused (`dirty = 2`); they exist only on this device, so "Remove" loses them. */
  rejected?: number;
  online?: boolean;
  /** M7: the final sync could not push everything while "Remove" was selected (OQ-D10). */
  syncFailed?: boolean;
  onConfirm: (choice: SignOutChoice) => void;
  onCancel: () => void;
}

type Choice = 'keep' | 'remove';

/**
 * D4 — "Sign out?" (DESIGN S7, 8.1). Native `<dialog>` + showModal(); the safe
 * default (Keep) is selected and focused; Esc/Cancel close without doing anything.
 */
export function SignOutDialog({ open, busy = false, writeFailed = false, pending = 0, rejected = 0, online = true, syncFailed = false, onConfirm, onCancel }: SignOutDialogProps) {
  const { t } = useT();
  const f = useFormat();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState<Choice>('keep');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setChoice('keep');
      dialog.showModal();
      keepRef.current?.focus();
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

  const remove = choice === 'remove';
  // Anything that is not in the account: changes waiting to sync, and rows the cloud refused (M7-D5).
  const unsynced = pending > 0 || rejected > 0;
  const removeAnyway = syncFailed && remove;
  const removeNote = remove && unsynced ? [pending > 0 ? t('auth.signOut.unsyncedRemove') : null, rejected > 0 ? t('auth.signOut.rejectedRemove') : null].filter(Boolean).join(' ') : '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onConfirm(removeAnyway ? { keepData: false, removeAnyway: true } : { keepData: !remove });
  }

  const describedBy = unsynced ? `${id}-body ${id}-unsynced` : `${id}-body`;
  return (
    <dialog ref={ref} className="dialog signout" aria-labelledby={`${id}-title`} aria-describedby={describedBy} aria-busy={busy || undefined} data-testid="signout-dialog">
      <form onSubmit={submit} noValidate>
        <div className="dialog-body">
          <h2 id={`${id}-title`}>{t('auth.signOut.title')}</h2>
          <p id={`${id}-body`}>{t('auth.signOut.body')}</p>
          {unsynced ? (
            <div className="alert info unsynced" id={`${id}-unsynced`} data-testid="unsynced-warning" data-pending={pending} data-rejected={rejected}>
              <Icon name="info" />
              <div className="stack-t">
                {pending > 0 ? (
                  <>
                    <p>{f.count('auth.signOut.unsynced', pending)}</p>
                    <p>{online ? t('auth.signOut.unsyncedOnline') : t('auth.signOut.unsyncedOffline')}</p>
                  </>
                ) : null}
                {rejected > 0 ? (
                  <>
                    <p data-testid="rejected-warning">{f.count('auth.signOut.rejected', rejected)}</p>
                    <p>{t('auth.signOut.rejectedKeep')}</p>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <fieldset className="radios" disabled={busy}>
            <legend>{t('auth.signOut.legend')}</legend>
            {/* The label is the tap target; the accessible name is only the bold line, the description is linked separately (DESIGN 8.1). */}
            <label className="opt">
              <input ref={keepRef} type="radio" name={`${id}-data`} value="keep" checked={!remove} onChange={() => setChoice('keep')} aria-labelledby={`${id}-keep-label`} aria-describedby={`${id}-keep-desc`} />
              <span className="l">
                <strong id={`${id}-keep-label`}>{t('auth.signOut.keep')}</strong>
                <span className="d" id={`${id}-keep-desc`}>
                  {t('auth.signOut.keepDesc')}
                </span>
              </span>
            </label>
            <label className="opt">
              <input type="radio" name={`${id}-data`} value="remove" checked={remove} onChange={() => setChoice('remove')} aria-labelledby={`${id}-remove-label`} aria-describedby={`${id}-remove-desc`} />
              <span className="l">
                <strong id={`${id}-remove-label`}>{t('auth.signOut.remove')}</strong>
                <span className="d" id={`${id}-remove-desc`}>
                  {rejected > 0 ? t('auth.signOut.removeDescRejected') : t('auth.signOut.removeDesc')}
                </span>
              </span>
            </label>
          </fieldset>
          {/* Always in the DOM (DESIGN 8.1): content appearing inside a live region is announced. */}
          <div role="status" className={removeNote ? 'remove-note' : 'sr-only'} data-testid="unsynced-remove">
            {removeNote}
          </div>
          {syncFailed ? <Alert>{t('auth.signOut.syncFailed')}</Alert> : null}
          {writeFailed ? <Alert>{t(WRITE_FAILED_KEY)}</Alert> : null}
        </div>
        <div className="actions">
          <Button type="submit" variant={remove ? 'danger' : 'primary'} disabled={busy} aria-busy={busy || undefined} data-testid="signout-confirm">
            {busy ? t('auth.signOut.working') : removeAnyway ? t('auth.signOut.removeAnyway') : remove ? t('auth.signOut.confirmRemove') : t('auth.signOut.confirmKeep')}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
