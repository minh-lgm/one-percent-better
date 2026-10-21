import { useState } from 'react';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../hooks/useT';

export interface StorageErrorProps {
  onRetry: () => Promise<void> | void;
  /** v5.0 (DESIGN 7.8.1 row 15): the native app has no private windows and no page to reload. */
  platform?: 'web' | 'ios' | 'android';
}

/** S9 — IndexedDB could not be opened. Rendered without the app shell (no container yet), in the browser-detected language. */
export function StorageError({ onRetry, platform = 'web' }: StorageErrorProps) {
  const { t } = useT();
  useDocumentTitle(t('storageError.title'));
  const [busy, setBusy] = useState(false);
  const native = platform !== 'web';
  return (
    <div className="error-page">
      <div className="box card empty">
        <Icon name="alert" />
        <h1 tabIndex={-1}>{t('storageError.title')}</h1>
        <p>{t(native ? 'storageError.bodyNative' : 'storageError.body')}</p>
        <ol style={{ textAlign: 'left' }}>
          <li>{t(native ? 'storageError.step1Native' : 'storageError.step1')}</li>
          <li>{t(native ? 'storageError.step2Native' : 'storageError.step2')}</li>
          <li>{t(native ? 'storageError.step3Native' : 'storageError.step3')}</li>
        </ol>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRetry();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('common.tryAgain')}
        </Button>
      </div>
    </div>
  );
}
