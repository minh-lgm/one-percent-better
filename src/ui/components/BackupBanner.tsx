import type { BackupReminder } from '../../domain/backup-file';
import { useFormat } from '../hooks/useFormat';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { LinkButton } from './Button';
import { Icon } from './Icon';

export interface BackupBannerProps {
  reminder: BackupReminder;
  /** Today shows a "Back up now" button; the Settings card does not (DESIGN §7.5). */
  withAction?: boolean;
}

/** Backup nag (FR-21, A-12, A-D9): neutral, non-blocking, at most one on a screen. */
export function BackupBanner({ reminder, withAction = false }: BackupBannerProps) {
  const { t } = useT();
  const f = useFormat();
  const { capabilities } = useServices();
  // v5.0 (DESIGN 7.8.1 row 8): "if this browser clears it" makes no sense in the native app.
  const neverKey = capabilities.platform === 'web' ? 'backup.banner.never' : 'backup.banner.neverNative';
  const text = reminder.kind === 'never' ? t(neverKey) : t('backup.banner.old', { n: f.number(reminder.days) });
  return (
    <div className="banner neutral backup" role="note" data-testid="backup-banner">
      <Icon name="info" />
      <p>{text}</p>
      {withAction ? (
        <LinkButton variant="secondary" to="/settings">
          {t('backup.banner.action')}
        </LinkButton>
      ) : null}
    </div>
  );
}
