// DESIGN S13 / S14 "not found": the roadmap id does not exist or was deleted (here or on another device). Lazy-only.
import { useEffect, useRef } from 'react';
import { LinkButton } from '../Button';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../hooks/useT';

export function RoadmapNotFound() {
  const { t } = useT('roadmap');
  useDocumentTitle(t('notFound.title'));
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="empty card" data-testid="roadmap-not-found">
      <h1 ref={ref} tabIndex={-1}>
        {t('notFound.title')}
      </h1>
      <p>{t('notFound.body')}</p>
      <LinkButton variant="primary" to="/roadmaps">
        {t('notFound.action')}
      </LinkButton>
    </div>
  );
}
