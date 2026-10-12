import { useOnline } from '../hooks/useOnline';
import { useT } from '../hooks/useT';
import { Icon } from './Icon';

export function OfflineChip() {
  const { t } = useT();
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-chip" role="status">
      <Icon name="offline" />
      <span>{t('offline.chip')}</span>
    </div>
  );
}
