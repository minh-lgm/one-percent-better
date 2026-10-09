import { useT } from '../hooks/useT';

/** Loading placeholder with an SR-only status (DESIGN §4). */
export function Skeleton({ blocks = 2 }: { blocks?: number }) {
  const { t } = useT();
  return (
    <div className="stack" aria-busy="true">
      <p className="sr-only" role="status">
        {t('common.loading')}
      </p>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="skeleton block" aria-hidden="true" />
      ))}
    </div>
  );
}
