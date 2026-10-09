import { useSyncExternalStore } from 'react';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { Button } from './Button';
import { Icon } from './Icon';

/** "A new version is available." + Reload, shown when the service worker has an update waiting. */
export function UpdateToast() {
  const { updates } = useServices();
  const { t } = useT();
  const available = useSyncExternalStore(updates.subscribe, updates.isAvailable, () => false);
  if (!available) return null;
  return (
    <div className="toast-region" style={{ bottom: 'auto', top: 12 }}>
      <div className="toast" role="status">
        <Icon name="info" />
        <span>{t('update.message')}</span>
        <Button variant="ghost" onClick={() => updates.apply()}>
          {t('update.reload')}
        </Button>
      </div>
    </div>
  );
}
