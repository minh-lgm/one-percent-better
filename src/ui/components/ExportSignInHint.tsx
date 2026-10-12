import { useId } from 'react';
import { useT } from '../hooks/useT';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Icon } from './Icon';

export interface ExportSignInHintProps {
  onSignIn: () => void;
  online: boolean;
  busy?: boolean;
}

/**
 * Sign-in hint under Export/Import after a successful export (FR-53, DESIGN S7 Backup, 8.1).
 * `role="group"` with a label, no live region (the "Backup exported" toast already spoke), no focus
 * move. When the device goes offline meanwhile, the button is disabled with the reason attached.
 */
export function ExportSignInHint({ onSignIn, online, busy = false }: ExportSignInHintProps) {
  const { t } = useT();
  const id = useId();
  const offlineId = `${id}-offline`;
  return (
    <div className="export-hint" role="group" aria-label={t('exportHint.label')} data-testid="export-sign-in-hint">
      <p className="text">
        <Icon name="cloudDot" />
        <span>{t('exportHint.text')}</span>
      </p>
      <GoogleSignInButton onClick={onSignIn} busy={busy} disabled={!online} describedBy={!online ? offlineId : undefined} />
      {!online ? (
        <p className="hint" id={offlineId} data-testid="export-hint-offline">
          {t('settings.account.offlineHint')}
        </p>
      ) : null}
    </div>
  );
}
