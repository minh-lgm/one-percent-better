import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import type { AccountDeleteErrorCode } from '../../domain/types';
import { useT } from '../hooks/useT';
import { Button } from './Button';
import { Icon } from './Icon';

export interface DeleteAccountDialogProps {
  open: boolean;
  /** The account about to be deleted (shown verbatim, DESIGN D6). */
  email: string;
  /** iOS + the account has an Apple identity: the note that iOS will ask to confirm with Apple first. */
  appleNote?: boolean;
  busy?: boolean;
  /** The last failure (ARCH §5.4 `ACCOUNT_DELETE_*`); the dialog stays open and the confirm button is usable again. */
  error?: AccountDeleteErrorCode | null;
  onConfirm: (choice: { keepData: boolean }) => void;
  onCancel: () => void;
}

type Choice = 'remove' | 'keep';

/**
 * D6 — "Delete your account?" (DESIGN S7 D6, 8.3; M14, FR-61). Native `<dialog>` + showModal(); the default
 * choice is "Remove data from this device" (OQ-16) and the initial focus is on Cancel (a destructive action must
 * not sit one Enter away). Busy: Esc and backdrop clicks are ignored, the confirm button keeps focus with
 * `aria-disabled`, Cancel and the radios are disabled. Errors are an Alert above the buttons; no toast.
 */
export function DeleteAccountDialog({ open, email, appleNote = false, busy = false, error = null, onConfirm, onCancel }: DeleteAccountDialogProps) {
  const { t } = useT();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState<Choice>('remove');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setChoice('remove');
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

  // After a failure the user is still on the confirm button (they pressed it); make sure focus is there (DESIGN 8.3).
  useEffect(() => {
    if (open && error && !busy) confirmRef.current?.focus();
  }, [open, error, busy]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onConfirm({ keepData: choice === 'keep' });
  }

  /** A click on the backdrop (outside the form) counts as Cancel, except while busy. */
  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current && !busy) onCancel();
  }

  const describedBy = appleNote ? `${id}-body ${id}-apple` : `${id}-body`;
  return (
    <dialog ref={ref} className="dialog signout delete" aria-labelledby={`${id}-title`} aria-describedby={describedBy} aria-busy={busy || undefined} onClick={onBackdrop} data-testid="delete-account-dialog">
      <form onSubmit={submit} noValidate>
        <div className="dialog-body" tabIndex={0}>
          <h2 id={`${id}-title`}>{t('auth.delete.title')}</h2>
          <p id={`${id}-body`}>{t('auth.delete.body')}</p>
          <p className="hint" data-testid="delete-account-email">
            {t('auth.delete.account', { email })}
          </p>
          {appleNote ? (
            <div className="alert info" id={`${id}-apple`} data-testid="delete-apple-note">
              <Icon name="info" />
              <div className="stack-t">
                <p>{t('auth.delete.appleNote')}</p>
              </div>
            </div>
          ) : null}
          <fieldset className="radios" disabled={busy}>
            <legend>{t('auth.delete.legend')}</legend>
            <label className="opt">
              <input type="radio" name={`${id}-data`} value="remove" checked={choice === 'remove'} onChange={() => setChoice('remove')} aria-labelledby={`${id}-remove-label`} aria-describedby={`${id}-remove-desc`} data-testid="delete-remove" />
              <span className="l">
                <strong id={`${id}-remove-label`}>{t('auth.delete.remove')}</strong>
                <span className="d" id={`${id}-remove-desc`}>
                  {t('auth.delete.removeDesc')}
                </span>
              </span>
            </label>
            <label className="opt">
              <input type="radio" name={`${id}-data`} value="keep" checked={choice === 'keep'} onChange={() => setChoice('keep')} aria-labelledby={`${id}-keep-label`} aria-describedby={`${id}-keep-desc`} data-testid="delete-keep" />
              <span className="l">
                <strong id={`${id}-keep-label`}>{t('auth.delete.keep')}</strong>
                <span className="d" id={`${id}-keep-desc`}>
                  {t('auth.delete.keepDesc')}
                </span>
              </span>
            </label>
          </fieldset>
          {/* Always in the DOM (DESIGN 8.3): text appearing inside a live region is announced. */}
          <div role="status" className={busy ? 'remove-note' : 'sr-only'} data-testid="delete-working">
            {busy ? t('auth.delete.workingStatus') : ''}
          </div>
          {error ? (
            <div className="alert" role="alert" data-testid="delete-account-error">
              <Icon name="alert" />
              <p>{t(`errors.${error}`)}</p>
            </div>
          ) : null}
        </div>
        <div className="actions">
          <Button ref={confirmRef} type="submit" variant="danger" icon={busy ? 'sync' : undefined} className={busy ? 'busy' : ''} aria-disabled={busy || undefined} aria-busy={busy || undefined} data-testid="delete-account-confirm">
            {busy ? t('auth.delete.working') : t('auth.delete.confirm')}
          </Button>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy} data-testid="delete-account-cancel">
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
