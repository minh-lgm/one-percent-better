import { useEffect, useRef } from 'react';
import { LinkButton } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../hooks/useT';

/** S8 — unknown route, or a goal id that does not exist. */
export function NotFound({ variant = 'page' }: { variant?: 'page' | 'goal' }) {
  const { t } = useT();
  const title = variant === 'goal' ? t('notFound.goalTitle') : t('notFound.pageTitle');
  useDocumentTitle(title);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="empty card">
      <Icon name="alert" />
      <h1 ref={ref} tabIndex={-1}>
        {title}
      </h1>
      <p>{variant === 'goal' ? t('errors.GOAL_NOT_FOUND') : t('notFound.pageBody')}</p>
      <LinkButton variant="primary" to={variant === 'goal' ? '/goals' : '/today'}>
        {variant === 'goal' ? t('notFound.goalAction') : t('notFound.pageAction')}
      </LinkButton>
    </div>
  );
}
