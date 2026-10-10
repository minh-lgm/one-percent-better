// Last-resort error screens (DESIGN S9 ErrorBoundary, FR-31). Two entry points:
// `ErrorBoundary` (React class boundary around the whole app) and
// `RouteErrorFallback` (react-router `errorElement` of the root route, so a
// render error in a screen never shows the router's default stack trace).
import { Component, type ReactNode } from 'react';
import { useNavigate, useRouteError } from 'react-router';
import { Button } from '../ui/components/Button';
import { Icon } from '../ui/components/Icon';
import { useDocumentTitle } from '../ui/hooks/useDocumentTitle';
import { useT } from '../ui/hooks/useT';

export interface ErrorFallbackProps {
  /** Clear the error and go to Today without reloading. */
  onGoToToday: () => void;
  reload?: () => void;
}

/** Full-page fallback: title, body, "Reload app" and "Go to Today" (DESIGN S9 copy). */
export function ErrorFallback({ onGoToToday, reload = () => window.location.reload() }: ErrorFallbackProps) {
  const { t } = useT();
  useDocumentTitle(t('errorBoundary.title'));
  return (
    <div className="error-page">
      <div className="box card empty" role="alert" data-testid="error-boundary">
        <Icon name="alert" />
        <h1 tabIndex={-1}>{t('errorBoundary.title')}</h1>
        <p>{t('errorBoundary.body')}</p>
        <div className="actions">
          <Button variant="primary" onClick={reload}>
            {t('errorBoundary.reload')}
          </Button>
          <Button variant="secondary" onClick={onGoToToday}>
            {t('notFound.pageAction')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** `errorElement` of the root route: navigating away clears the route error. */
export function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  if (import.meta.env.DEV) console.error(error);
  return <ErrorFallback onGoToToday={() => void navigate('/today', { replace: true })} />;
}

interface BoundaryState {
  failed: boolean;
}

/** Catches render errors outside the router (providers, toasts, shell). */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorFallback
        onGoToToday={() => {
          window.location.hash = '#/today';
          this.setState({ failed: false });
        }}
      />
    );
  }
}
