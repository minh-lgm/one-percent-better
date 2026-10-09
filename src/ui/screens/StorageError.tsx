import { useState } from 'react';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../hooks/useT';

/** S9 — IndexedDB could not be opened. Rendered without the app shell, in the browser-detected language. */
export function StorageError({ onRetry }: { onRetry: () => Promise<void> | void }) {
  const { t } = useT();
  useDocumentTitle(t('storageError.title'));
  const [busy, setBusy] = useState(false);
  return (
    <div className="error-page">
      <div className="box card empty">
        <Icon name="alert" />
        <h1 tabIndex={-1}>{t('storageError.title')}</h1>
        <p>{t('storageError.body')}</p>
        <ol style={{ textAlign: 'left' }}>
          <li>{t('storageError.step1')}</li>
          <li>{t('storageError.step2')}</li>
          <li>{t('storageError.step3')}</li>
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
