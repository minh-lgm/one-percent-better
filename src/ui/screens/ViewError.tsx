import { ErrorState } from '../components/ErrorState';
import { useT } from '../hooks/useT';

/** Route `errorElement` for lazy screens: the chunk could not be loaded (DESIGN S6/S4 error). */
export function ViewError() {
  const { t } = useT();
  return <ErrorState title={t('errors.loadViewTitle')} body={t('errors.loadViewBody')} actionLabel={t('common.retry')} onAction={() => window.location.reload()} />;
}
