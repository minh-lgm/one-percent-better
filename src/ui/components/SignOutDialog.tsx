import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { WRITE_FAILED_KEY } from '../error-messages';
import { useT } from '../hooks/useT';
import { Alert } from './Alert';
import { Button } from './Button';

export interface SignOutDialogProps {
  open: boolean;
  busy?: boolean;
  /** Removing local data failed: the dialog stays open with `errors.WRITE_FAILED`. */
  writeFailed?: boolean;
  onConfirm: (choice: { keepData: boolean }) => void;
  onCancel: () => void;
}

type Choice = 'keep' | 'remove';

/**
 * D4 — "Sign out?" (DESIGN S7, 8.1). Native `<dialog>` + showModal(); the safe
 * default (Keep) is selected and focused; Esc/Cancel close without doing anything.
 */
export function SignOutDialog({ open, busy = false, writeFailed = false, onConfirm, onCancel }: SignOutDialogProps) {
  const { t } = useT();
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

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onConfirm({ keepData: choice === 'keep' });
  }

  const remove = choice === 'remove';
  return (
    <dialog ref={ref} className="dialog signout" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} aria-busy={busy || undefined} data-testid="signout-dialog">
      <form onSubmit={submit} noValidate>
        <div className="dialog-body">
          <h2 id={`${id}-title`}>{t('auth.signOut.title')}</h2>
          <p id={`${id}-body`}>{t('auth.signOut.body')}</p>
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
                  {t('auth.signOut.removeDesc')}
                </span>
              </span>
            </label>
          </fieldset>
          {writeFailed ? <Alert>{t(WRITE_FAILED_KEY)}</Alert> : null}
        </div>
        <div className="actions">
          <Button type="submit" variant={remove ? 'danger' : 'primary'} disabled={busy} aria-busy={busy || undefined} data-testid="signout-confirm">
            {busy ? t('auth.signOut.working') : remove ? t('auth.signOut.confirmRemove') : t('auth.signOut.confirmKeep')}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
