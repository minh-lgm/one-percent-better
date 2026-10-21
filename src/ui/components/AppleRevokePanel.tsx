import { useT } from '../hooks/useT';
import { Button } from './Button';
import { Icon } from './Icon';

export const APPLE_REVOKE_HELP_URL = 'https://support.apple.com/102571';

export interface AppleRevokePanelProps {
  onDismiss: () => void;
}

/**
 * Shown right under the Account heading after a deletion the function could not finish on Apple's side
 * (`appleRevoked === 'manual-required'`, A-62; DESIGN S7 "Panel hướng dẫn tự thu hồi Apple"). Not a live region
 * (the toast already announced the result); lives in memory until Dismiss or a reload (A-D65).
 */
export function AppleRevokePanel({ onDismiss }: AppleRevokePanelProps) {
  const { t } = useT();
  return (
    <div className="alert info revoke-panel" data-testid="apple-revoke-panel">
      <Icon name="info" />
      <div className="stack-t">
        <strong>{t('auth.delete.revokeTitle')}</strong>
        <p>{t('auth.delete.revokeBody')}</p>
        <div className="alert-actions">
          <a className="btn ghost" href={APPLE_REVOKE_HELP_URL} target="_blank" rel="noopener" data-testid="apple-revoke-link">
            {t('auth.delete.revokeLink')}
            <span className="sr-only"> {t('a11y.opensExternal')}</span>
          </a>
          <Button variant="ghost" onClick={onDismiss} data-testid="apple-revoke-dismiss">
            {t('common.dismiss')}
          </Button>
        </div>
      </div>
    </div>
  );
}
