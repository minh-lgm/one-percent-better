import { useEffect } from 'react';
import { useT } from './useT';

/** `document.title = "<page> — 1% Better"`, updated on language change (FR-32). */
export function useDocumentTitle(page: string): void {
  const { t } = useT();
  useEffect(() => {
    document.title = t('doc.title', { page });
  }, [page, t]);
}
