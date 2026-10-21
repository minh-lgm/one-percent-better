import { useId } from 'react';
import type { AuthProvider } from '../../services/auth-port';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { Icon } from './Icon';
import { SignInButtons } from './SignInButtons';

export interface ExportSignInHintProps {
  /** M14: the provider of the button that was tapped. */
  onSignIn: (provider: AuthProvider) => void;
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
  const { capabilities } = useServices();
  const id = useId();
  const offlineId = `${id}-offline`;
  return (
    <div className="export-hint" role="group" aria-label={t('exportHint.label')} data-testid="export-sign-in-hint">
      <p className="text">
        <Icon name="cloudDot" />
        {/* DESIGN 7.8.2: on native the backup was shared, not downloaded, and the sign-in may be Apple or Google. */}
        <span>{t(capabilities.nativeShare ? 'exportHint.textNative' : 'exportHint.text')}</span>
      </p>
      <SignInButtons onSignIn={onSignIn} busy={busy} disabled={!online} describedBy={!online ? offlineId : undefined} />
      {!online ? (
        <p className="hint" id={offlineId} data-testid="export-hint-offline">
          {t('settings.account.offlineHint')}
        </p>
      ) : null}
    </div>
  );
}
