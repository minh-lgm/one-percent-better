import { useEffect, useRef, type ReactNode } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: ReactNode;
  /** Focus the heading when the screen mounts (route change, DESIGN §3.1). */
  autoFocus?: boolean;
}

export function PageHeader({ title, subtitle, actions, back, autoFocus = true }: PageHeaderProps) {
  useDocumentTitle(title);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <header className="page-head">
      <div className="titles">
        {back}
        <h1 ref={ref} tabIndex={-1}>
          {title}
        </h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}
