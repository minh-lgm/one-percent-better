import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export interface ErrorStateProps {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}

/** Centred error with one action (DESIGN §5 ErrorState; S6/S4 chunk or data errors). */
export function ErrorState({ title, body, actionLabel, onAction }: ErrorStateProps) {
  useDocumentTitle(title);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="empty card" role="alert" data-testid="error-state">
      <Icon name="alert" />
      <h1 ref={ref} tabIndex={-1}>
        {title}
      </h1>
      <p>{body}</p>
      <Button variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
