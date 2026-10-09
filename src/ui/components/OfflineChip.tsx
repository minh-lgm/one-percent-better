import { useSyncExternalStore } from 'react';
import { useT } from '../hooks/useT';
import { Icon } from './Icon';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function OfflineChip() {
  const { t } = useT();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="offline-chip" role="status">
      <Icon name="offline" />
      <span>{t('offline.chip')}</span>
    </div>
  );
}
